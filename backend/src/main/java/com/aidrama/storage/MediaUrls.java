package com.aidrama.storage;

import com.aidrama.config.AppProperties;
import org.springframework.stereotype.Component;

/** Builds public media URLs from an object key. The base URL is the CDN or public bucket origin. */
@Component
public class MediaUrls {

    private final String base;

    public MediaUrls(AppProperties props) {
        this.base = props.storage().publicBaseUrl().replaceAll("/+$", "");
    }

    public String publicUrl(String storageKey) {
        return base + "/" + storageKey;
    }
}
