package com.aidrama.like;

/** Response body of {@code POST} and {@code DELETE /videos/{slug}/like}. */
public final class LikeDtos {

    private LikeDtos() {}

    /**
     * The like state after the call.
     *
     * @param liked whether the caller likes the video now
     * @param likeCount the video's authoritative like count after the call, read in the same transaction
     */
    public record LikeStateResponse(boolean liked, long likeCount) {}
}
