package com.aidrama.user;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailAndDeletedAtIsNull(String email);

    Optional<User> findByIdAndDeletedAtIsNull(UUID id);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    /** One query for the creator block of many videos or series. Avoids N+1. */
    @Query("""
            select new com.aidrama.user.CreatorSummary(u.id, u.username, p.displayName, p.avatarUrl, p.followerCount)
            from User u join UserProfile p on p.userId = u.id
            where u.id in :ids
            """)
    List<CreatorSummary> findCreatorSummaries(@Param("ids") Collection<UUID> ids);
}
