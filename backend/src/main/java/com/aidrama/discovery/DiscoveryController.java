package com.aidrama.discovery;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.common.api.PageParams;
import com.aidrama.common.api.Paginated;
import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.discovery.DiscoveryDtos.HomeFeed;
import com.aidrama.discovery.DiscoveryDtos.SeriesDetailResponse;
import com.aidrama.discovery.DiscoveryDtos.SeriesResponse;
import com.aidrama.discovery.DiscoveryService.VideoSort;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.video.VideoDtos.VideoResponse;
import com.aidrama.video.VideoType;
import java.util.List;
import java.util.Locale;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public discovery endpoints (spec 7.2). No login required. A bearer token, when sent, lets owners open their own
 * non-public videos and fills {@code isLiked} on the returned videos.
 */
@RestController
@RequestMapping(ApiPaths.BASE)
public class DiscoveryController {

    private final DiscoveryService discovery;

    public DiscoveryController(DiscoveryService discovery) {
        this.discovery = discovery;
    }

    @GetMapping("/home")
    public HomeFeed home(@AuthenticationPrincipal Jwt jwt) {
        return discovery.home(viewer(jwt));
    }

    @GetMapping("/videos")
    public Paginated<VideoResponse> videos(
            @RequestParam(required = false) VideoType type,
            @RequestParam(required = false) String genre,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @AuthenticationPrincipal Jwt jwt) {
        return discovery.listVideos(type, genre, parseSort(sort), PageParams.of(page, pageSize), viewer(jwt));
    }

    @GetMapping("/videos/{slug}")
    public VideoResponse video(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return discovery.getBySlug(slug, viewer(jwt));
    }

    @GetMapping("/series")
    public Paginated<SeriesResponse> series(
            @RequestParam(required = false) String genre,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return discovery.listSeries(genre, PageParams.of(page, pageSize));
    }

    @GetMapping("/series/{slug}")
    public SeriesDetailResponse seriesDetail(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return discovery.getSeriesBySlug(slug, viewer(jwt));
    }

    private static AuthenticatedUser viewer(Jwt jwt) {
        return jwt == null ? null : AuthenticatedUser.from(jwt);
    }

    private static VideoSort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return VideoSort.POPULAR;
        }
        try {
            return VideoSort.valueOf(sort.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("sort", "must be one of popular, recent, liked")));
        }
    }
}
