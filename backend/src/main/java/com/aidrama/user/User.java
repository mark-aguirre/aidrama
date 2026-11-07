package com.aidrama.user;

import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Table {@code users}. Email and username are stored normalized (see {@code ck_users_*_format}). */
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "email", nullable = false, length = 254)
    private String email;

    @Column(name = "username", nullable = false, length = 30)
    private String username;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_status", nullable = false, length = 20)
    private AccountStatus accountStatus;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    public static User register(String email, String username, String passwordHash) {
        User user = new User();
        user.id = UUID.randomUUID();
        user.email = email;
        user.username = username;
        user.passwordHash = passwordHash;
        user.accountStatus = AccountStatus.ACTIVE;
        return user;
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public boolean isActive() {
        return deletedAt == null && accountStatus == AccountStatus.ACTIVE;
    }

    /** Idempotent: a second verification keeps the original timestamp. */
    public void markEmailVerified(Instant now) {
        if (emailVerifiedAt == null) {
            emailVerifiedAt = now;
        }
    }
}
