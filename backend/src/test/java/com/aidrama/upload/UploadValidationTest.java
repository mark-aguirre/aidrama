package com.aidrama.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.aidrama.common.exception.ApiException;
import com.aidrama.config.AppProperties;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.storage.ObjectStorage;
import com.aidrama.upload.UploadDtos.InitiateUploadRequest;
import com.aidrama.user.Role;
import com.aidrama.video.VideoAssetRepository;
import com.aidrama.video.VideoRepository;
import java.time.Clock;
import java.time.Duration;
import java.util.EnumSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

/** Request rules checked before any database or storage access: format, extension, size, role. */
class UploadValidationTest {

    private final UploadSessionRepository sessions = mock(UploadSessionRepository.class);
    private final VideoRepository videos = mock(VideoRepository.class);
    private final UploadService service = new UploadService(
            sessions,
            videos,
            mock(VideoAssetRepository.class),
            mock(ProcessingJobRepository.class),
            mock(ObjectStorage.class),
            mock(ProcessingStatusService.class),
            mock(TransactionTemplate.class),
            new AppProperties(
                    null,
                    new AppProperties.Storage("b", "us-east-1", null, false, null, null, "https://cdn.test.invalid", Duration.ofMinutes(60), 1_000_000L),
                    null, null, null, null, null, null),
            Clock.systemUTC());

    private final AuthenticatedUser creator = new AuthenticatedUser(UUID.randomUUID(), EnumSet.of(Role.USER, Role.CREATOR));

    private InitiateUploadRequest req(String filename, String contentType, long size) {
        return new InitiateUploadRequest(UUID.randomUUID(), filename, contentType, size, AssetKind.VIDEO);
    }

    private InitiateUploadRequest thumb(String filename, String contentType, long size) {
        return new InitiateUploadRequest(UUID.randomUUID(), filename, contentType, size, AssetKind.THUMBNAIL);
    }

    private void assertRejected(InitiateUploadRequest request, int status, String code) {
        assertThatThrownBy(() -> service.initiate(creator, request, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getStatus().value()).isEqualTo(status);
                    assertThat(ex.getCode()).isEqualTo(code);
                });
        verifyNoInteractions(sessions, videos);
    }

    @Test
    void rejectsUnsupportedContentTypes() {
        assertRejected(req("clip.avi", "video/x-msvideo", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
        assertRejected(req("clip.mp4", "application/octet-stream", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
        assertRejected(req("clip.mp4", "VIDEO/MP4", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
    }

    @Test
    void rejectsExtensionThatDoesNotMatchContentType() {
        assertRejected(req("clip.mov", "video/mp4", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
        assertRejected(req("clip", "video/mp4", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
        assertRejected(req("clip.mp4.exe", "video/mp4", 100), 400, "UNSUPPORTED_VIDEO_FORMAT");
    }

    @Test
    void rejectsFilesOverTheSizeLimitWith413() {
        assertRejected(req("clip.mp4", "video/mp4", 1_000_001L), 413, "UPLOAD_TOO_LARGE");
    }

    @Test
    void acceptsSupportedThumbnailFormats() {
        // Validation passes the format/size gate; execution then reaches the mocked transaction,
        // which returns null and fails later. We only assert no format/size rejection was raised.
        for (InitiateUploadRequest ok : new InitiateUploadRequest[] {
            thumb("poster.jpg", "image/jpeg", 100),
            thumb("poster.jpeg", "image/jpeg", 100),
            thumb("poster.png", "image/png", 100),
            thumb("poster.webp", "image/webp", 100),
        }) {
            assertThatThrownBy(() -> service.initiate(creator, ok, null))
                    .satisfies(thrown -> {
                        if (thrown instanceof ApiException api) {
                            assertThat(api.getCode())
                                    .isNotEqualTo("UNSUPPORTED_IMAGE_FORMAT")
                                    .isNotEqualTo("THUMBNAIL_TOO_LARGE");
                        }
                    });
        }
    }

    @Test
    void rejectsUnsupportedThumbnailFormats() {
        assertRejected(thumb("poster.gif", "image/gif", 100), 400, "UNSUPPORTED_IMAGE_FORMAT");
        assertRejected(thumb("poster.mp4", "video/mp4", 100), 400, "UNSUPPORTED_IMAGE_FORMAT");
        assertRejected(thumb("poster.png", "image/jpeg", 100), 400, "UNSUPPORTED_IMAGE_FORMAT");
    }

    @Test
    void rejectsThumbnailOverFiveMegabytes() {
        assertRejected(thumb("poster.jpg", "image/jpeg", 5L * 1024 * 1024 + 1), 413, "THUMBNAIL_TOO_LARGE");
    }

    @Test
    void requiresCreatorRoleInTheUseCase() {
        AuthenticatedUser plainUser = new AuthenticatedUser(UUID.randomUUID(), EnumSet.of(Role.USER));
        assertThatThrownBy(() -> service.initiate(plainUser, req("clip.mp4", "video/mp4", 100), null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(403));
        assertThatThrownBy(() -> service.complete(plainUser, UUID.randomUUID()))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(403));
        assertThatThrownBy(() -> service.cancel(plainUser, UUID.randomUUID()))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(403));
        verifyNoInteractions(sessions, videos);
    }

    @Test
    void rejectsMalformedIdempotencyKey() {
        assertThatThrownBy(() -> service.initiate(creator, req("clip.mp4", "video/mp4", 100), "short"))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(400));
        assertThatThrownBy(() -> service.initiate(creator, req("clip.mp4", "video/mp4", 100), "bad key with spaces!!"))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(400));
    }

    @Test
    void sanitizesFilenames() {
        assertThat(UploadService.sanitizeFilename("C:\\Users\\me\\movie.mp4")).isEqualTo("movie.mp4");
        assertThat(UploadService.sanitizeFilename("../../etc/passwd.mp4")).isEqualTo("passwd.mp4");
        assertThat(UploadService.sanitizeFilename("mo\u0000vie\n.mp4")).isEqualTo("movie.mp4");
        assertThatThrownBy(() -> UploadService.sanitizeFilename("   ")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> UploadService.sanitizeFilename("/")).isInstanceOf(ApiException.class);
    }
}
