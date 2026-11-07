package com.aidrama.common.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import lombok.Getter;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * {@code created_at} and {@code updated_at} are owned by the database (column default and the
 * {@code set_updated_at()} trigger). Hibernate never writes them; it reads them back after
 * each insert or update.
 */
@MappedSuperclass
@Getter
public abstract class TimestampedEntity {

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Generated(event = {EventType.INSERT, EventType.UPDATE})
    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;
}
