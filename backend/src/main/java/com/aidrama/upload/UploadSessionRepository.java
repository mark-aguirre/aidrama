package com.aidrama.upload;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UploadSessionRepository extends JpaRepository<UploadSession, UUID> {

    Optional<UploadSession> findByIdAndCreatorId(UUID id, UUID creatorId);

    Optional<UploadSession> findByCreatorIdAndIdempotencyKey(UUID creatorId, String idempotencyKey);

    List<UploadSession> findByVideoIdAndStatusIn(UUID videoId, Collection<UploadStatus> statuses);

    Optional<UploadSession> findFirstByVideoIdOrderByCreatedAtDesc(UUID videoId);
}
