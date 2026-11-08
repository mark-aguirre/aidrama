package com.aidrama.upload;

import com.aidrama.config.AppProperties;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * LOCAL DEVELOPMENT ONLY. Rewrites an uploaded video so a browser can play it progressively over
 * HTTP, standing in for the real transcoder. It runs {@code ffmpeg -c copy -movflags +faststart},
 * which moves the MP4 {@code moov} atom (duration and sample index) to the front of the file
 * without re-encoding. A raw upload often has {@code moov} at the end, which leaves the player stuck
 * at 0:00 because it cannot read the metadata from the first bytes it fetches.
 *
 * <p>Active only when {@code aidrama.processing.dev-stub.faststart.enabled=true}. It uses its own
 * S3 client with generous timeouts because the shared client is tuned for small metadata calls, not
 * for transferring whole media files.
 */
@Component
@ConditionalOnProperty(prefix = "aidrama.processing.dev-stub.faststart", name = "enabled", havingValue = "true")
public class MediaRemuxer implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MediaRemuxer.class);

    private final S3Client transferClient;
    private final String bucket;
    private final String ffmpegPath;
    private final Duration timeout;

    public MediaRemuxer(AppProperties props) {
        AppProperties.Storage s = props.storage();
        AppProperties.Processing.DevStub.Faststart cfg = props.processing().devStub().faststart();
        this.bucket = s.bucket();
        this.ffmpegPath = cfg.ffmpegPath();
        this.timeout = cfg.timeout();
        this.transferClient = buildTransferClient(s);
    }

    /**
     * Downloads the object at {@code sourceKey}, rewrites it with faststart, uploads the result to a
     * sibling {@code playable/} key, and returns that key. The original object is left untouched.
     *
     * @throws RemuxException if download, ffmpeg or upload fails, so the caller can fail the job.
     */
    public String remuxToFaststart(String sourceKey) {
        Path work = null;
        Path in = null;
        Path out = null;
        try {
            work = Files.createTempDirectory("aidrama-remux-");
            in = work.resolve("in.mp4");
            out = work.resolve("out.mp4");

            transferClient.getObject(
                    GetObjectRequest.builder().bucket(bucket).key(sourceKey).build(), in);
            log.info("Faststart: downloaded source key={} bytes={}", sourceKey, sizeOrMinusOne(in));

            runFfmpeg(in, out);
            log.info("Faststart: remux complete out bytes={}", sizeOrMinusOne(out));

            String playableKey = playableKeyFor(sourceKey);
            transferClient.putObject(
                    PutObjectRequest.builder().bucket(bucket).key(playableKey).contentType("video/mp4").build(),
                    RequestBody.fromFile(out));
            log.info("Faststart: uploaded playable key={}", playableKey);
            return playableKey;
        } catch (RemuxException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new RemuxException("Faststart remux failed for key=" + sourceKey, ex);
        } finally {
            deleteQuietly(in);
            deleteQuietly(out);
            deleteQuietly(work);
        }
    }

    private void runFfmpeg(Path in, Path out) {
        List<String> command = List.of(
                ffmpegPath, "-y", "-i", in.toString(), "-c", "copy", "-movflags", "+faststart", out.toString());
        Process process = null;
        try {
            process = new ProcessBuilder(command).redirectErrorStream(true).start();
            // ffmpeg can block on a full stdout/stderr pipe, so drain it while it runs.
            String tail = drainTail(process);
            boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RemuxException("ffmpeg timed out after " + timeout);
            }
            int code = process.exitValue();
            if (code != 0) {
                throw new RemuxException("ffmpeg exited with code " + code + "; last output: " + tail);
            }
            if (!Files.exists(out) || sizeOrMinusOne(out) <= 0) {
                throw new RemuxException("ffmpeg produced no output file");
            }
        } catch (IOException ex) {
            throw new RemuxException("Could not start ffmpeg at '" + ffmpegPath + "'. Is it installed and on PATH?", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            if (process != null) {
                process.destroyForcibly();
            }
            throw new RemuxException("Interrupted while waiting for ffmpeg", ex);
        }
    }

    private static String drainTail(Process process) throws IOException {
        StringBuilder tail = new StringBuilder();
        try (var reader = process.inputReader()) {
            String line;
            while ((line = reader.readLine()) != null) {
                tail.append(line).append('\n');
                if (tail.length() > 4000) {
                    tail.delete(0, tail.length() - 4000);
                }
            }
        }
        return tail.toString();
    }

    /**
     * Maps {@code videos/{id}/original/{asset}.mp4} to {@code videos/{id}/playable/{asset}.mp4}. For
     * any other shape, appends a {@code .faststart.mp4} suffix so the playable object never collides
     * with the original.
     */
    static String playableKeyFor(String sourceKey) {
        int lastSlash = sourceKey.lastIndexOf('/');
        String dir = lastSlash < 0 ? "" : sourceKey.substring(0, lastSlash);
        String name = lastSlash < 0 ? sourceKey : sourceKey.substring(lastSlash + 1);
        if (dir.endsWith("/original")) {
            String base = dir.substring(0, dir.length() - "/original".length());
            return base + "/playable/" + name;
        }
        return sourceKey + ".faststart.mp4";
    }

    private static long sizeOrMinusOne(Path p) {
        try {
            return Files.size(p);
        } catch (IOException ex) {
            return -1;
        }
    }

    private static void deleteQuietly(Path p) {
        if (p == null) {
            return;
        }
        try {
            Files.deleteIfExists(p);
        } catch (IOException ex) {
            log.debug("Could not delete temp path {}: {}", p, ex.toString());
        }
    }

    private static S3Client buildTransferClient(AppProperties.Storage s) {
        var builder = S3Client.builder()
                .region(Region.of(s.region()))
                .credentialsProvider(credentials(s))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(s.pathStyle()).build());
        // Remuxing runs on the backend, so it must bypass the public Cloudflare
        // media host just like the shared S3 client. A CDN can alter or reject
        // signed S3 requests, while the internal endpoint reaches SeaweedFS directly.
        String serverEndpoint = StringUtils.hasText(s.internalEndpoint()) ? s.internalEndpoint() : s.endpoint();
        if (StringUtils.hasText(serverEndpoint)) {
            builder.endpointOverride(URI.create(serverEndpoint));
        }
        return builder.build();
    }

    private static AwsCredentialsProvider credentials(AppProperties.Storage s) {
        if (StringUtils.hasText(s.accessKeyId()) && StringUtils.hasText(s.secretAccessKey())) {
            return StaticCredentialsProvider.create(AwsBasicCredentials.create(s.accessKeyId(), s.secretAccessKey()));
        }
        return DefaultCredentialsProvider.builder().build();
    }

    @Override
    public void close() {
        transferClient.close();
    }

    /** Thrown when the faststart pipeline cannot produce a playable object. */
    public static class RemuxException extends RuntimeException {
        public RemuxException(String message) {
            super(message);
        }

        public RemuxException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
