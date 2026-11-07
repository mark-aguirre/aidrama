package com.aidrama.video;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoAssetRepository extends JpaRepository<VideoAsset, UUID> {

    Optional<VideoAsset> findByVideoIdAndAssetType(UUID videoId, AssetType assetType);

    /** Playable and thumbnail assets for many videos in one query. */
    List<VideoAsset> findByVideoIdInAndAssetTypeInAndProcessingStatus(
            Collection<UUID> videoIds, Collection<AssetType> types, ProcessingStatus status);
}
