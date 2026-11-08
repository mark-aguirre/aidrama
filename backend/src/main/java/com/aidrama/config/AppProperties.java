package com.aidrama.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * All application settings under the {@code aidrama} prefix. Validated at startup, so a missing
 * secret or an out-of-range value stops the application instead of failing on first use.
 */
@Validated
@ConfigurationProperties(prefix = "aidrama")
public record AppProperties(
        @Valid @NotNull Auth auth,
        @Valid @NotNull Storage storage,
        @Valid @NotNull Cors cors,
        @Valid @NotNull Web web,
        @Valid @NotNull Mail mail,
        @Valid @NotNull Catalog catalog,
        @Valid @NotNull Processing processing,
        @Valid @NotNull Views views) {

    /**
     * View counting. {@code salt} keys the hash that turns a user id or anonymous session id into the stored
     * {@code viewer_key}; it is server-side only and never appears in a response or log. Changing it makes
     * every viewer look new (daily de-duplication restarts), so rotate it deliberately.
     * {@code qualifiedSeconds} is the watch time a {@code VIEW_QUALIFIED} event needs to bump a video's view count.
     */
    public record Views(
            @NotBlank @Size(min = 16, message = "must be at least 16 characters") String salt,
            @Min(1) @Max(3600) @DefaultValue("10") int qualifiedSeconds) {}

    /** Token settings. The signing secret comes from the environment only. */
    public record Auth(
            @NotBlank @Size(min = 32, message = "must be at least 32 characters (256 bits)") String jwtSecret,
            @NotBlank @DefaultValue("aidrama") String issuer,
            @NotBlank @DefaultValue("aidrama-api") String audience,
            @NotNull @DefaultValue("15m") Duration accessTokenTtl,
            @NotNull @DefaultValue("14d") Duration refreshTokenTtl,
            @NotNull @DefaultValue("30d") Duration maxSessionAge,
            @NotNull @DefaultValue("24h") Duration emailVerificationTtl) {}

    /**
     * S3-compatible object storage.
     *
     * {@code endpoint} is the public, browser-facing base used to presign upload URLs (and usually
     * matches {@code publicBaseUrl}'s origin). {@code internalEndpoint}, when set, is used instead
     * for the backend's own server-to-server S3 calls (HEAD, multipart create/complete/abort) so
     * those signed requests reach the storage origin directly. This matters behind a caching CDN
     * such as Cloudflare: a CDN fills its cache for a HEAD by fetching the origin with a GET, which
     * no longer matches a SigV4 signature computed for HEAD, so the origin rejects it with 403.
     * Point {@code internalEndpoint} at the storage origin to keep signed backend calls off the CDN
     * while browser presigned URLs keep using the public {@code endpoint}. Blank means fall back to
     * {@code endpoint}.
     *
     * {@code multipartThresholdBytes} is the file size at or above which an upload is split into
     * {@code multipartPartBytes} chunks (S3 multipart) so no single request body exceeds a proxy's
     * limit (Cloudflare caps at 100 MB). In production keep the part size at or above the S3 minimum
     * of 5 MiB and below the proxy limit; the default 90 MiB stays safely under 100 MB after signing
     * overhead. The validation floor is 1 byte only so tests can exercise the path with tiny sizes.
     */
    public record Storage(
            @NotBlank String bucket,
            @NotBlank String region,
            String endpoint,
            String internalEndpoint,
            @DefaultValue("false") boolean pathStyle,
            String accessKeyId,
            String secretAccessKey,
            @NotBlank String publicBaseUrl,
            @NotNull @DefaultValue("60m") Duration uploadUrlTtl,
            @Min(1) @Max(5_368_709_120L) @DefaultValue("2147483648") long maxUploadBytes,
            @Min(1) @Max(5_368_709_120L) @DefaultValue("94371840") long multipartThresholdBytes,
            @Min(1) @Max(5_368_709_120L) @DefaultValue("94371840") long multipartPartBytes) {}

    /** Browser origins allowed by CORS. Explicit list, no wildcard. */
    public record Cors(@NotEmpty List<@NotBlank String> allowedOrigins) {}

    /** Public web app (Next.js) settings. */
    public record Web(@NotBlank String baseUrl) {}

    /** Outgoing mail settings. Mail is a stub for the MVP. */
    public record Mail(@DefaultValue("false") boolean logLinks) {}

    /** Catalog vocabulary. Genres are an allowlist until a genres table exists. */
    public record Catalog(@NotEmpty List<@NotBlank @Size(max = 40) String> genres) {}

    /** Background processing settings. */
    public record Processing(@Valid @NotNull DevStub devStub) {

        /** Simulated worker for local development. Never enable in a shared environment. */
        public record DevStub(
                @DefaultValue("false") boolean enabled,
                @NotNull @DefaultValue("3s") Duration interval,
                @Valid @NotNull @DefaultValue Faststart faststart) {

            /**
             * Optional ffmpeg remux step for the dev stub. When enabled, the stub downloads the
             * uploaded original, rewrites it with {@code -movflags +faststart} (moves the moov atom
             * to the front so a browser can play it progressively) and uploads the result, then
             * registers that object as playable. When disabled, the stub serves the raw original,
             * which may not play if its moov atom is at the end of the file.
             */
            public record Faststart(
                    @DefaultValue("false") boolean enabled,
                    @NotBlank @DefaultValue("ffmpeg") String ffmpegPath,
                    @NotNull @DefaultValue("5m") Duration timeout) {}
        }
    }
}
