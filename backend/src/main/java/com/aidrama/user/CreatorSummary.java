package com.aidrama.user;

import java.util.UUID;

/** Public creator fields. Matches the {@code Creator} type in the frontend domain types. */
public record CreatorSummary(UUID id, String username, String displayName, String avatarUrl, long followerCount) {}
