package com.aidrama.upload;

/**
 * What an upload session delivers. {@code VIDEO} is the original source file that is transcoded
 * into HLS; {@code THUMBNAIL} is a creator-supplied poster image recorded directly as a thumbnail
 * asset without a processing job. Values of {@code ck_upload_sessions_asset_kind}.
 */
public enum AssetKind {
    VIDEO,
    THUMBNAIL
}
