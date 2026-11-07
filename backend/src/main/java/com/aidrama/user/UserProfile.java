package com.aidrama.user;

import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Table {@code user_profiles}. One row per user, primary key is the user id. */
@Entity
@Table(name = "user_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserProfile extends TimestampedEntity {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "display_name", nullable = false, length = 50)
    private String displayName;

    @Column(name = "bio", nullable = false, length = 500)
    private String bio;

    @Column(name = "avatar_url", length = 2048)
    private String avatarUrl;

    @Column(name = "follower_count", nullable = false)
    private long followerCount;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public static UserProfile create(UUID userId, String displayName) {
        UserProfile profile = new UserProfile();
        profile.userId = userId;
        profile.displayName = displayName;
        profile.bio = "";
        profile.followerCount = 0;
        return profile;
    }
}
