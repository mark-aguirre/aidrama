package com.aidrama.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/** Table {@code user_roles}. Unique per (user, role). */
@Entity
@Table(name = "user_roles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserRole {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private Role role;

    @Column(name = "granted_by")
    private UUID grantedBy;

    @Generated(event = EventType.INSERT)
    @Column(name = "granted_at", insertable = false, updatable = false)
    private Instant grantedAt;

    public static UserRole grant(UUID userId, Role role, UUID grantedBy) {
        UserRole ur = new UserRole();
        ur.id = UUID.randomUUID();
        ur.userId = userId;
        ur.role = role;
        ur.grantedBy = grantedBy;
        return ur;
    }
}
