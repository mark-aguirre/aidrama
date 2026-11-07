package com.aidrama.series;

import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Table {@code drama_seasons}. Read-only in this slice. */
@Entity
@Table(name = "drama_seasons")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Season extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "series_id", nullable = false)
    private UUID seriesId;

    @Column(name = "season_number", nullable = false)
    private int seasonNumber;

    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "description", nullable = false, length = 5000)
    private String description;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
