package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.support.IntegrationTestBase;
import com.aidrama.upload.ProcessingJob;
import com.aidrama.upload.ProcessingJobService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Inline trailer, end to end against PostgreSQL with migration 0011: create, upload and link a trailer,
 * publish the title independently of it, resolve it for viewers only when playable, and the real
 * database constraints reaching the client as the documented errors.
 *
 * <p>Needs Docker (Testcontainers), so it runs in the verify phase only.
 */
class TrailerLinkFlowIT extends IntegrationTestBase {

    private static final long SIZE = 5_000;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ProcessingJobService worker;

    // ---- helpers ----

    private String createVideo(TestUser creator, String type, String title) throws Exception {
        MvcResult r = mvc.perform(authedPost(creator, "/api/v1/creator/videos", """
                        {"type":"%s","title":"%s","description":"d","isAiGenerated":true}
                        """.formatted(type, title)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(r, "$.id");
    }

    /** Same upload pipeline for every video type: initiate, PUT to storage, complete. */
    private void upload(TestUser creator, String videoId) throws Exception {
        MvcResult init = mvc.perform(authedPost(creator, "/api/v1/uploads/initiate", """
                        {"videoId":"%s","filename":"clip.mp4","contentType":"video/mp4","sizeBytes":%d}
                        """.formatted(videoId, SIZE)))
                .andExpect(status().isCreated())
                .andReturn();
        String uploadId = json(init, "$.id");
        String key = jdbc.queryForObject("select storage_key from upload_sessions where id = ?::uuid", String.class, uploadId);
        storage.put(key, SIZE, "video/mp4");
        mvc.perform(authedPost(creator, "/api/v1/uploads/" + uploadId + "/complete", "")).andExpect(status().isOk());
    }

    private void process(String videoId) {
        for (int i = 0; i < 200; i++) {
            ProcessingJob job = worker.claimNext("test-worker").orElseThrow(() -> new AssertionError("No runnable job for " + videoId));
            if (job.getVideoId().toString().equals(videoId)) {
                worker.succeed(job.getId(), 45, "videos/" + videoId + "/hls/master.m3u8", "videos/" + videoId + "/thumbnails/poster.jpg");
                return;
            }
        }
        throw new AssertionError("Job for " + videoId + " was never claimed");
    }

    private String link(TestUser creator, String titleId, String trailerId) throws Exception {
        return mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + titleId + "/trailer", "{\"trailerVideoId\":\"" + trailerId + "\"}"))
                .andReturn().getResponse().getContentAsString();
    }

    private String slugOf(TestUser creator, String videoId) throws Exception {
        return json(mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + videoId)).andReturn(), "$.slug");
    }

    private void publish(TestUser creator, String videoId) throws Exception {
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + videoId + "/publish", "{\"genre\":\"Drama\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isOk());
    }

    // ---- the flow ----

    @Test
    void titlePublishesOnItsOwnAndTheTrailerAppearsOnceItIsPlayable() throws Exception {
        TestUser creator = registerUser();
        String title = createVideo(creator, "MOVIE", "Beyond");
        String trailer = createVideo(creator, "TRAILER", "Beyond: Trailer");
        upload(creator, title);
        upload(creator, trailer);

        // Linked while the trailer is still PROCESSING: allowed, but nothing is exposed yet.
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + title + "/trailer", "{\"trailerVideoId\":\"" + trailer + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").value(trailer))
                .andExpect(jsonPath("$.trailer").isEmpty());

        // The title becomes READY and publishes while the trailer is still processing.
        process(title);
        publish(creator, title);
        String slug = slugOf(creator, title);
        mvc.perform(get("/api/v1/videos/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicationStatus").value("PUBLISHED"))
                .andExpect(jsonPath("$.trailer").isEmpty())
                .andExpect(jsonPath("$.trailerVideoId").isEmpty());

        // The trailer finishes: viewers now get a playable stream, without publishing the trailer itself.
        process(trailer);
        mvc.perform(get("/api/v1/videos/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").value(trailer))
                .andExpect(jsonPath("$.trailer.id").value(trailer))
                .andExpect(jsonPath("$.trailer.hlsUrl").value("https://cdn.test.invalid/media/videos/" + trailer + "/hls/master.m3u8"))
                .andExpect(jsonPath("$.trailer.durationSeconds").value(45));
        mvc.perform(authedGet(creator, "/api/v1/creator/videos/" + title))
                .andExpect(jsonPath("$.trailer.hlsUrl").isNotEmpty());

        // Soft-deleting the trailer makes it "no trailer" at once. The link row is left alone.
        mvc.perform(delete("/api/v1/creator/videos/" + trailer).header("Authorization", bearer(creator))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/videos/" + slug))
                .andExpect(jsonPath("$.trailer").isEmpty())
                .andExpect(jsonPath("$.trailerVideoId").isEmpty());
        assertThat(jdbc.queryForObject("select trailer_video_id::text from videos where id = ?::uuid", String.class, title)).isEqualTo(trailer);
    }

    @Test
    void unlinkAndParentDeleteFreeTheTrailerForAnotherTitle() throws Exception {
        TestUser creator = registerUser();
        String first = createVideo(creator, "MOVIE", "First");
        String second = createVideo(creator, "MOVIE", "Second");
        String trailer = createVideo(creator, "TRAILER", "Shared trailer");

        link(creator, first, trailer);
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + second + "/trailer", "{\"trailerVideoId\":\"" + trailer + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("TRAILER_ALREADY_LINKED"));

        mvc.perform(delete("/api/v1/creator/videos/" + first + "/trailer").header("Authorization", bearer(creator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").isEmpty());
        // Unlinking again is a no-op.
        mvc.perform(delete("/api/v1/creator/videos/" + first + "/trailer").header("Authorization", bearer(creator)))
                .andExpect(status().isOk());

        link(creator, first, trailer);
        mvc.perform(delete("/api/v1/creator/videos/" + first).header("Authorization", bearer(creator))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select trailer_video_id from videos where id = ?::uuid", String.class, first)).isNull();
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + second + "/trailer", "{\"trailerVideoId\":\"" + trailer + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").value(trailer));
    }

    @Test
    void invalidLinksAreCleanClientErrors() throws Exception {
        TestUser creator = registerUser();
        TestUser stranger = registerUser();
        String title = createVideo(creator, "MOVIE", "Beyond");
        String notATrailer = createVideo(creator, "SHORT", "A short");
        String trailer = createVideo(creator, "TRAILER", "Trailer");
        String foreignTrailer = createVideo(stranger, "TRAILER", "Not yours");

        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + title + "/trailer", "{\"trailerVideoId\":\"" + notATrailer + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("NOT_A_TRAILER"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + title + "/trailer", "{\"trailerVideoId\":\"" + title + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("TRAILER_SELF_LINK"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + title + "/trailer", "{\"trailerVideoId\":\"" + foreignTrailer + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("TRAILER_NOT_FOUND"));
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + trailer + "/trailer", "{\"trailerVideoId\":\"" + notATrailer + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("TRAILER_NESTING_NOT_ALLOWED"));
        // Another creator's title is a 404, and the trailer id is not probed.
        mvc.perform(authedPost(stranger, "/api/v1/creator/videos/" + title + "/trailer", "{\"trailerVideoId\":\"" + foreignTrailer + "\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(authedPost(creator, "/api/v1/creator/videos/" + title + "/trailer", "{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
