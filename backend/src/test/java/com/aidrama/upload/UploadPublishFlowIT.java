package com.aidrama.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.security.TokenService;
import com.aidrama.support.IntegrationTestBase;
import com.aidrama.user.Role;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/** Signup, upload, process, publish and watch, end to end against PostgreSQL. */
class UploadPublishFlowIT extends IntegrationTestBase {

    private static final long SIZE = 5_000;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ProcessingJobService worker;

    @Autowired
    TokenService tokens;

    // ---- helpers ----

    private String createVideo(TestUser creator, String title) throws Exception {
        MvcResult r = mvc.perform(authedPost(creator, "/api/v1/creator/videos", """
                        {"type":"MOVIE","title":"%s","description":"A lone probe drifts. It finds company.","isAiGenerated":true}
                        """.formatted(title)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(r, "$.id");
    }

    private MvcResult initiate(TestUser creator, String videoId, String key) throws Exception {
        var req = authedPost(creator, "/api/v1/uploads/initiate", """
                {"videoId":"%s","filename":"movie.mp4","contentType":"video/mp4","sizeBytes":%d}
                """.formatted(videoId, SIZE));
        if (key != null) {
            req.header("Idempotency-Key", key);
        }
        return mvc.perform(req).andReturn();
    }

    private String uploadKey(String uploadId) {
        return jdbc.queryForObject("select storage_key from upload_sessions where id = ?::uuid", String.class, uploadId);
    }

    /** Creates a video, uploads and confirms it. Returns {videoId, uploadId}. */
    private String[] uploadedVideo(TestUser creator, String title) throws Exception {
        String videoId = createVideo(creator, title);
        MvcResult init = initiate(creator, videoId, null);
        assertThat(init.getResponse().getStatus()).isEqualTo(201);
        String uploadId = json(init, "$.id");
        storage.put(uploadKey(uploadId), SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", "")).andExpect(status().isOk());
        return new String[] {videoId, uploadId};
    }

    /**
     * Claims runnable jobs until the one for {@code videoId} comes up. The database is shared by all
     * tests, so earlier tests may have left other PENDING jobs; those are claimed and left PROCESSING.
     */
    private ProcessingJob claimJobFor(String videoId) {
        for (int i = 0; i < 200; i++) {
            ProcessingJob job = worker.claimNext("test-worker").orElseThrow(() -> new AssertionError("No runnable job for " + videoId));
            if (job.getVideoId().toString().equals(videoId)) {
                return job;
            }
        }
        throw new AssertionError("Job for " + videoId + " was never claimed");
    }

    private void runWorkerSuccessfully(String videoId) {
        ProcessingJob job = claimJobFor(videoId);
        worker.reportProgress(job.getId(), 60);
        worker.succeed(job.getId(), 95, "videos/" + videoId + "/hls/master.m3u8", "videos/" + videoId + "/thumbnails/poster.jpg");
    }

    // ---- the happy path ----

    @Test
    void creatorUploadsProcessesPublishesAndAnonymousViewerWatches() throws Exception {
        TestUser creator = registerUser();
        String title = "Beyond the Universe " + UUID.randomUUID().toString().substring(0, 6);

        // 1. Draft
        String videoId = createVideo(creator, title);
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicationStatus").value("DRAFT"))
                .andExpect(jsonPath("$.processingStatus").value("PENDING"))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.isAiGenerated").value(true))
                .andExpect(jsonPath("$.durationSeconds").value(0))
                .andExpect(jsonPath("$.genre").value(""))
                .andExpect(jsonPath("$.thumbnailUrl").isEmpty())
                .andExpect(jsonPath("$.hlsUrl").isEmpty())
                .andExpect(jsonPath("$.creator.username").value(creator.username()))
                .andExpect(jsonPath("$.creator.followerCount").value(0));

        // 2. Initiate upload
        MvcResult init = initiate(creator, videoId, null);
        assertThat(init.getResponse().getStatus()).isEqualTo(201);
        String uploadId = json(init, "$.id");
        assertThat(init.getResponse().getContentAsString())
                .contains("\"status\":\"PENDING\"")
                .contains("\"method\":\"PUT\"")
                .contains("\"Content-Type\":\"video/mp4\"");
        String key = uploadKey(uploadId);
        assertThat(key).isEqualTo("videos/" + videoId + "/original/" + uploadId + ".mp4");
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andExpect(jsonPath("$.processingStatus").value("UPLOADING"));

        // 3. One in-flight session per video
        MvcResult second = initiate(creator, videoId, null);
        assertThat(second.getResponse().getStatus()).isEqualTo(409);
        assertThat(second.getResponse().getContentAsString())
                .contains("UPLOAD_IN_PROGRESS")
                .contains(uploadId);

        // 4. Confirm before the object exists
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_OBJECT_MISSING"));

        // 5. Browser uploads, then confirms
        storage.put(key, SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upload.status").value("COMPLETED"))
                .andExpect(jsonPath("$.upload.upload").isEmpty())
                .andExpect(jsonPath("$.processing.processingStatus").value("PROCESSING"))
                .andExpect(jsonPath("$.processing.jobStatus").value("PENDING"));
        // Retrying the confirmation is safe and creates no second job.
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upload.status").value("COMPLETED"));
        assertThat(jdbc.queryForObject("select count(*) from processing_jobs where video_id = ?::uuid", Integer.class, videoId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from video_assets where video_id = ?::uuid and asset_type = 'ORIGINAL'", Integer.class, videoId)).isEqualTo(1);

        // 6. Cannot publish while processing (spec rule: must finish processing first)
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"Science Fiction\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VIDEO_NOT_READY"));
        mvc.perform(authedGet(creator, "/api/v1/videos/" + videoId + "/processing-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.processingStatus").value("PROCESSING"));

        // 7. Worker finishes
        runWorkerSuccessfully(videoId);
        mvc.perform(authedGet(creator, "/api/v1/videos/" + videoId + "/processing-status"))
                .andExpect(jsonPath("$.processingStatus").value("READY"))
                .andExpect(jsonPath("$.publicationStatus").value("READY"))
                .andExpect(jsonPath("$.jobStatus").value("READY"))
                .andExpect(jsonPath("$.progressPercent").value(100));

        // 8. Genre is required to publish, PRIVATE is not a publish target
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("GENRE_REQUIRED"))
                .andExpect(jsonPath("$.error.details[0].field").value("genre"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"Science Fiction\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VISIBILITY_REQUIRED"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"Underwater Opera\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isBadRequest());

        // Not visible to the public yet
        MvcResult slugResult = mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andReturn();
        String slug = json(slugResult, "$.slug");
        mvc.perform(get("/api/v1/videos/" + slug)).andExpect(status().isNotFound());

        // 9. Publish
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"science fiction\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicationStatus").value("PUBLISHED"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.genre").value("Science Fiction"))
                .andExpect(jsonPath("$.publishedAt").isNotEmpty())
                .andExpect(jsonPath("$.durationSeconds").value(95))
                .andExpect(jsonPath("$.hlsUrl").value("https://cdn.test.invalid/media/videos/" + videoId + "/hls/master.m3u8"))
                .andExpect(jsonPath("$.thumbnailUrl").value("https://cdn.test.invalid/media/videos/" + videoId + "/thumbnails/poster.jpg"));

        // 10. Anonymous viewer: discovery and watch page
        mvc.perform(get("/api/v1/videos/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(videoId))
                .andExpect(jsonPath("$.processingStatus").value("READY"))
                .andExpect(jsonPath("$.creator.id").value(creator.id().toString()))
                .andExpect(jsonPath("$.hlsUrl").isNotEmpty());
        mvc.perform(get("/api/v1/videos").param("genre", "Science Fiction").param("type", "MOVIE").param("sort", "recent"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='%s')]".formatted(videoId)).exists())
                .andExpect(jsonPath("$.pagination.page").value(1))
                .andExpect(jsonPath("$.pagination.pageSize").value(20))
                .andExpect(jsonPath("$.pagination.hasNext").isBoolean());
        MvcResult home = mvc.perform(get("/api/v1/home")).andExpect(status().isOk())
                .andExpect(jsonPath("$.stats.length()").value(3))
                .andReturn();
        assertThat(home.getResponse().getContentAsString()).contains(videoId);

        // 11. Creator dashboard lists it
        mvc.perform(authedGet(creator, "/api/v1/creator/videos").param("status", "PUBLISHED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='%s')]".formatted(videoId)).exists());

        // 12. Republishing is idempotent and keeps the first published_at
        MvcResult before = mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andReturn();
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedAt").value((String) json(before, "$.publishedAt")));
    }

    @Test
    void largeVideoUsesMultipartAndCompletesWithPartEtags() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Large film");

        // 25000 bytes with a 10000-byte part size (test profile) => 3 parts.
        long largeSize = 25_000;
        MvcResult init = mvc.perform(authedPost(creator, "/api/v1/uploads/initiate", """
                        {"videoId":"%s","filename":"movie.mp4","contentType":"video/mp4","sizeBytes":%d}
                        """.formatted(videoId, largeSize)))
                .andExpect(status().isCreated())
                // A multipart session exposes the chunk plan, not a single PUT target.
                .andExpect(jsonPath("$.upload").isEmpty())
                .andExpect(jsonPath("$.multipart.partSizeBytes").value(10000))
                .andExpect(jsonPath("$.multipart.totalParts").value(3))
                .andExpect(jsonPath("$.multipart.parts.length()").value(3))
                .andExpect(jsonPath("$.multipart.parts[0].partNumber").value(1))
                .andExpect(jsonPath("$.multipart.parts[0].url").isNotEmpty())
                .andExpect(jsonPath("$.multipart.parts[2].partNumber").value(3))
                .andReturn();
        String uploadId = json(init, "$.id");
        String key = uploadKey(uploadId);

        // Confirming a multipart session with the single-PUT endpoint is rejected.
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_IS_MULTIPART"));

        // The browser PUTs each part; the fake storage records the assembled object on complete,
        // so the test "uploads" by declaring the final object before confirming.
        storage.put(key, largeSize, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete-multipart", """
                        {"parts":[{"partNumber":1,"eTag":"etag-1"},{"partNumber":3,"eTag":"etag-3"},{"partNumber":2,"eTag":"etag-2"}]}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upload.status").value("COMPLETED"))
                .andExpect(jsonPath("$.processing.processingStatus").value("PROCESSING"))
                .andExpect(jsonPath("$.processing.jobStatus").value("PENDING"));

        // Retrying is idempotent and queues no second job.
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete-multipart", """
                        {"parts":[{"partNumber":1,"eTag":"etag-1"},{"partNumber":2,"eTag":"etag-2"},{"partNumber":3,"eTag":"etag-3"}]}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upload.status").value("COMPLETED"));
        assertThat(jdbc.queryForObject("select count(*) from processing_jobs where video_id = ?::uuid", Integer.class, videoId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from video_assets where video_id = ?::uuid and asset_type = 'ORIGINAL'", Integer.class, videoId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select multipart_upload_id from upload_sessions where id = ?::uuid", String.class, uploadId)).isNotNull();
    }

    @Test
    void singlePutSessionRejectsTheMultipartCompleteEndpoint() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Small film");
        // SIZE (5000) is below the multipart threshold, so this is a single-PUT session.
        String uploadId = json(initiate(creator, videoId, null), "$.id");

        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete-multipart", """
                        {"parts":[{"partNumber":1,"eTag":"etag-1"}]}
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_NOT_MULTIPART"));
    }

    @Test
    void creatorUploadsRequiredThumbnailWhichShowsUpImmediatelyWithoutProcessing() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "With poster");

        // Initiate a THUMBNAIL upload on a fresh draft: no video has been uploaded yet.
        MvcResult init = mvc.perform(authedPost(creator, "/api/v1/uploads/initiate", """
                        {"videoId":"%s","filename":"poster.jpg","contentType":"image/jpeg","sizeBytes":%d,"assetKind":"THUMBNAIL"}
                        """.formatted(videoId, SIZE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.assetKind").value("THUMBNAIL"))
                .andExpect(jsonPath("$.upload.headers.['Content-Type']").value("image/jpeg"))
                .andReturn();
        String uploadId = json(init, "$.id");
        String key = uploadKey(uploadId);
        assertThat(key).isEqualTo("videos/" + videoId + "/thumbnail/" + uploadId + ".jpg");

        // A thumbnail upload does not move the video into UPLOADING.
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId))
                .andExpect(jsonPath("$.processingStatus").value("PENDING"));

        // Browser PUTs the image, then confirms. No processing job is queued.
        storage.put(key, SIZE, "image/jpeg");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upload.status").value("COMPLETED"))
                .andExpect(jsonPath("$.upload.assetKind").value("THUMBNAIL"))
                .andExpect(jsonPath("$.processing.processingStatus").value("PENDING"));
        assertThat(jdbc.queryForObject("select count(*) from processing_jobs where video_id = ?::uuid", Integer.class, videoId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from video_assets where video_id = ?::uuid and asset_type = 'THUMBNAIL'", Integer.class, videoId)).isEqualTo(1);

        // thumbnailUrl now resolves on the video, independent of processing.
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId))
                .andExpect(jsonPath("$.thumbnailUrl").value("https://cdn.test.invalid/media/videos/" + videoId + "/thumbnail/" + uploadId + ".jpg"))
                .andExpect(jsonPath("$.processingStatus").value("PENDING"));

        // The video file can still be uploaded afterwards (thumbnail did not hold an in-flight slot).
        MvcResult videoInit = initiate(creator, videoId, null);
        assertThat(videoInit.getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void rejectsUnsupportedThumbnailFormats() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Bad poster");

        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate", """
                        {"videoId":"%s","filename":"poster.gif","contentType":"image/gif","sizeBytes":10,"assetKind":"THUMBNAIL"}
                        """.formatted(videoId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_IMAGE_FORMAT"));
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate", """
                        {"videoId":"%s","filename":"poster.jpg","contentType":"image/jpeg","sizeBytes":%d,"assetKind":"THUMBNAIL"}
                        """.formatted(videoId, 5L * 1024 * 1024 + 1)))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.code").value("THUMBNAIL_TOO_LARGE"));
        assertThat(jdbc.queryForObject("select count(*) from upload_sessions where video_id = ?::uuid", Integer.class, videoId)).isZero();
    }

    @Test
    void failedProcessingShowsTheReasonBlocksPublishAndAllowsReupload() throws Exception {
        TestUser creator = registerUser();
        String[] ids = uploadedVideo(creator, "Bad codec");
        String videoId = ids[0];

        ProcessingJob job = claimJobFor(videoId);
        worker.fail(job.getId(), "UNSUPPORTED_CODEC", "The video uses a codec that cannot be processed.");

        mvc.perform(authedGet(creator, "/api/v1/videos/" + videoId + "/processing-status"))
                .andExpect(jsonPath("$.processingStatus").value("FAILED"))
                .andExpect(jsonPath("$.publicationStatus").value("FAILED"))
                .andExpect(jsonPath("$.jobStatus").value("FAILED"))
                .andExpect(jsonPath("$.failure.code").value("UNSUPPORTED_CODEC"))
                .andExpect(jsonPath("$.failure.message").value("The video uses a codec that cannot be processed."));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"Drama\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VIDEO_NOT_READY"));

        // Re-upload replaces the ORIGINAL asset and queues a second job.
        MvcResult retry = initiate(creator, videoId, null);
        assertThat(retry.getResponse().getStatus()).isEqualTo(201);
        String retryId = json(retry, "$.id");
        storage.put(uploadKey(retryId), SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + retryId + "/complete", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.processing.processingStatus").value("PROCESSING"));
        assertThat(jdbc.queryForObject("select count(*) from processing_jobs where video_id = ?::uuid", Integer.class, videoId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from video_assets where video_id = ?::uuid and asset_type = 'ORIGINAL'", Integer.class, videoId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select storage_key from video_assets where video_id = ?::uuid and asset_type = 'ORIGINAL'", String.class, videoId))
                .isEqualTo(uploadKey(retryId));
    }

    // ---- upload rules ----

    @Test
    void rejectsUnsupportedFormatsAndOversizedFiles() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Format checks");

        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.avi\",\"contentType\":\"video/x-msvideo\",\"sizeBytes\":10}".formatted(videoId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_VIDEO_FORMAT"));
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":2000000}".formatted(videoId)))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_TOO_LARGE"));
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":0}".formatted(videoId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[0].field").value("sizeBytes"));
        assertThat(jdbc.queryForObject("select count(*) from upload_sessions where video_id = ?::uuid", Integer.class, videoId)).isZero();
    }

    @Test
    void movAndWebmAreAccepted() throws Exception {
        TestUser creator = registerUser();
        String mov = createVideo(creator, "Mov");
        String webm = createVideo(creator, "Webm");
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.MOV\",\"contentType\":\"video/quicktime\",\"sizeBytes\":10}".formatted(mov)))
                .andExpect(status().isCreated());
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.webm\",\"contentType\":\"video/webm\",\"sizeBytes\":10}".formatted(webm)))
                .andExpect(status().isCreated());
    }

    @Test
    void sizeMismatchFailsTheUploadWithAReasonAndAllowsRetry() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Mismatch");
        String uploadId = json(initiate(creator, videoId, null), "$.id");
        storage.put(uploadKey(uploadId), SIZE - 1, "video/mp4");

        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_VERIFICATION_FAILED"));

        mvc.perform(authedGet(creator, "/api/v1/uploads/" + uploadId))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failure.code").value("UPLOAD_VERIFICATION_FAILED"))
                .andExpect(jsonPath("$.upload").isEmpty());
        mvc.perform(authedGet(creator, "/api/v1/videos/" + videoId + "/processing-status"))
                .andExpect(jsonPath("$.processingStatus").value("FAILED"))
                .andExpect(jsonPath("$.failure.code").value("UPLOAD_VERIFICATION_FAILED"));
        // A failed session cannot be completed later.
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isConflict());

        // Retry with a new session works.
        MvcResult retry = initiate(creator, videoId, null);
        assertThat(retry.getResponse().getStatus()).isEqualTo(201);
        String retryId = json(retry, "$.id");
        storage.put(uploadKey(retryId), SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + retryId + "/complete", "")).andExpect(status().isOk());
    }

    @Test
    void contentTypeMismatchInStorageFailsVerification() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Wrong type");
        String uploadId = json(initiate(creator, videoId, null), "$.id");
        storage.put(uploadKey(uploadId), SIZE, "text/html");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_VERIFICATION_FAILED"));
    }

    @Test
    void cancelFreesTheVideoForANewUpload() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Cancel me");
        String uploadId = json(initiate(creator, videoId, null), "$.id");

        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/cancel", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.upload").isEmpty());
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/cancel", "")).andExpect(status().isOk());
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andExpect(jsonPath("$.processingStatus").value("PENDING"));
        assertThat(initiate(creator, videoId, null).getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void completedUploadCannotBeCancelledOrRestarted() throws Exception {
        TestUser creator = registerUser();
        String[] ids = uploadedVideo(creator, "Done");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + ids[1] + "/cancel", ""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_ALREADY_COMPLETED"));
        MvcResult again = initiate(creator, ids[0], null);
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat(again.getResponse().getContentAsString()).contains("VIDEO_ALREADY_UPLOADED");
    }

    @Test
    void expiredSessionIsDetectedAndReplacedOnNextInitiate() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Expired");
        String uploadId = json(initiate(creator, videoId, null), "$.id");
        jdbc.update("update upload_sessions set expires_at = now() - interval '2 hours' where id = ?::uuid", uploadId);

        storage.put(uploadKey(uploadId), SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", ""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("UPLOAD_SESSION_EXPIRED"));
        assertThat(jdbc.queryForObject("select status from upload_sessions where id = ?::uuid", String.class, uploadId)).isEqualTo("EXPIRED");

        // A stale in-flight session is also cleared by a new initiate.
        String second = createVideo(creator, "Expired two");
        String staleId = json(initiate(creator, second, null), "$.id");
        jdbc.update("update upload_sessions set expires_at = now() - interval '2 hours' where id = ?::uuid", staleId);
        assertThat(initiate(creator, second, null).getResponse().getStatus()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select status from upload_sessions where id = ?::uuid", String.class, staleId)).isEqualTo("EXPIRED");
    }

    @Test
    void idempotencyKeyReplayReturnsTheSameSession() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Idempotent");
        String key = "idem-" + UUID.randomUUID();

        MvcResult first = initiate(creator, videoId, key);
        MvcResult replay = initiate(creator, videoId, key);

        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        assertThat(replay.getResponse().getStatus()).isEqualTo(200);
        assertThat((String) json(replay, "$.id")).isEqualTo(json(first, "$.id"));
        assertThat(jdbc.queryForObject("select count(*) from upload_sessions where video_id = ?::uuid", Integer.class, videoId)).isEqualTo(1);

        // Same key, different payload is a client bug.
        mvc.perform(authedPost(creator, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"other.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":%d}".formatted(videoId, SIZE))
                        .header("Idempotency-Key", key))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
    }

    // ---- ownership and roles ----

    @Test
    void otherCreatorsCannotSeeOrTouchAVideoOrItsUploads() throws Exception {
        TestUser owner = registerUser();
        TestUser intruder = registerUser();
        String videoId = createVideo(owner, "Mine");
        String uploadId = json(initiate(owner, videoId, null), "$.id");

        mvc.perform(authedGet(intruder, "/api/v1/creator/videos/" + videoId)).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/creator/videos/" + videoId)
                        .header("Authorization", bearer(intruder))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Hijacked\",\"language\":\"en\",\"visibility\":\"PUBLIC\",\"isAiGenerated\":true,\"version\":0}"))
                .andExpect(status().isNotFound());
        mvc.perform(authedPost(intruder, "/api/v1/creator/videos/" + videoId + "/publish", "{}")).andExpect(status().isNotFound());
        mvc.perform(authedGet(intruder, "/api/v1/videos/" + videoId + "/processing-status")).andExpect(status().isNotFound());
        mvc.perform(authedGet(intruder, "/api/v1/uploads/" + uploadId)).andExpect(status().isNotFound());
        mvc.perform(authedPost(intruder, "/api/v1/uploads/" + uploadId + "/complete", "")).andExpect(status().isNotFound());
        mvc.perform(authedPost(intruder, "/api/v1/uploads/" + uploadId + "/cancel", "")).andExpect(status().isNotFound());
        mvc.perform(authedPost(intruder, "/api/v1/uploads/initiate",
                        "{\"videoId\":\"%s\",\"filename\":\"a.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":10}".formatted(videoId)))
                .andExpect(status().isNotFound());

        // The intruder's own list never contains it.
        mvc.perform(authedGet(intruder, "/api/v1/creator/videos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='%s')]".formatted(videoId)).doesNotExist());
        // The owner still sees it untouched.
        mvc.perform(authedGet(owner, "/api/v1/creator/videos/" + videoId)).andExpect(jsonPath("$.title").value("Mine"));
    }

    @Test
    void anonymousCallersGet401AndCallersWithoutCreatorRoleGet403() throws Exception {
        mvc.perform(get("/api/v1/creator/videos")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/uploads/initiate").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/videos/" + UUID.randomUUID() + "/processing-status")).andExpect(status().isUnauthorized());

        TestUser user = registerUser();
        String userOnlyToken = tokens.issueAccessToken(user.id(), List.of(Role.USER));
        mvc.perform(get("/api/v1/creator/videos").header("Authorization", "Bearer " + userOnlyToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        mvc.perform(post("/api/v1/uploads/initiate")
                        .header("Authorization", "Bearer " + userOnlyToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void ownerCanPreviewTheirPrivateVideoButNobodyElseCan() throws Exception {
        TestUser owner = registerUser();
        TestUser other = registerUser();
        String videoId = createVideo(owner, "Private preview");
        String slug = json(mvc.perform(authedGet(owner, "/api/v1/creator/videos/" + videoId)).andReturn(), "$.slug");

        mvc.perform(get("/api/v1/videos/" + slug)).andExpect(status().isNotFound());
        mvc.perform(authedGet(other, "/api/v1/videos/" + slug)).andExpect(status().isNotFound());
        mvc.perform(authedGet(owner, "/api/v1/videos/" + slug)).andExpect(status().isOk());
    }

    // ---- editing and concurrency ----

    @Test
    void updateUsesOptimisticLocking() throws Exception {
        TestUser creator = registerUser();
        String videoId = createVideo(creator, "Versioned");
        MvcResult current = mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andReturn();
        int version = json(current, "$.version");

        String body = """
                {"title":"Renamed","description":"New","genre":"Drama","language":"en","visibility":"PRIVATE","isAiGenerated":true,"version":%d}
                """;
        mvc.perform(put("/api/v1/creator/videos/" + videoId)
                        .header("Authorization", bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(version)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed"))
                .andExpect(jsonPath("$.genre").value("Drama"))
                .andExpect(jsonPath("$.version").value(version + 1));

        mvc.perform(put("/api/v1/creator/videos/" + videoId)
                        .header("Authorization", bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(version)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONCURRENT_MODIFICATION"));
    }

    @Test
    void createValidationAndEpisodeRestriction() throws Exception {
        TestUser creator = registerUser();
        mvc.perform(authedPost(creator, "/api/v1/creator/videos", "{\"type\":\"MOVIE\",\"title\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[?(@.field=='title')]").exists())
                .andExpect(jsonPath("$.error.details[?(@.field=='isAiGenerated')]").exists());
        mvc.perform(authedPost(creator, "/api/v1/creator/videos", "{\"type\":\"EPISODE\",\"title\":\"Ep\",\"isAiGenerated\":true}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("EPISODE_NOT_SUPPORTED"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos", "{\"type\":\"DOCUMENTARY\",\"title\":\"x\",\"isAiGenerated\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(authedPost(creator, "/api/v1/creator/videos", "{\"type\":\"MOVIE\",\"title\":\"x\",\"genre\":\"Nope\",\"isAiGenerated\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[0].field").value("genre"));
    }

    @Test
    void paginationParametersAreValidated() throws Exception {
        mvc.perform(get("/api/v1/videos").param("pageSize", "500")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/videos").param("page", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/videos").param("sort", "bogus")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/videos").param("type", "BOGUS")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/videos").param("unknownParam", "x")).andExpect(status().isOk());
    }
}
