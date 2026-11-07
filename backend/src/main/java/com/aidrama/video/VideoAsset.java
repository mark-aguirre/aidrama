package com.aidrama.video;

import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Table {@code video_assets}. A stored object belonging to a video. Public URLs are built from
 * bucket and key by the backend; they are not stored. The table has no version column.
 */
@Entity
@Table(name = "video_assets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VideoAsset extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "video_id", nullable = false)
    private UUID videoId;

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 20)
    private AssetType assetType;

    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status", nullable = false, length = 20)
    private ProcessingStatus processingStatus;

    @Column(name = "storage_bucket", nullable = false, length = 63)
    private String storageBucket;

    @Column(name = "storage_key", nullable = false, length = 1024)
    private String storageKey;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "width_px")
    private Integer widthPx;

    @Column(name = "height_px")
    private Integer heightPx;

    @Column(name = "bitrate_kbps")
    private Integer bitrateKbps;

    @Column(name = "rendition_label", length = 20)
    private String renditionLabel;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "checksum_sha256", length = 64)
    private String checksumSha256;

    public static VideoAsset create(
            UUID videoId, AssetType type, ProcessingStatus status, String bucket, String key, String mimeType, Long sizeBytes) {
        VideoAsset a = new VideoAsset();
        a.id = UUID.randomUUID();
        a.videoId = videoId;
        a.assetType = type;
        a.processingStatus = status;
        a.storageBucket = bucket;
        a.storageKey = key;
        a.mimeType = mimeType;
        a.sizeBytes = sizeBytes;
        return a;
    }

    /** Points an existing ORIGINAL asset at a newly uploaded object (a retry after a failed attempt). */
    public void replaceObject(String bucket, String key, String mimeType, Long sizeBytes, ProcessingStatus status) {
        this.storageBucket = bucket;
        this.storageKey = key;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.processingStatus = status;
    }
}
