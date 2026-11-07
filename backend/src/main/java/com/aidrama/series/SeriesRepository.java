package com.aidrama.series;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface SeriesRepository extends JpaRepository<Series, UUID>, JpaSpecificationExecutor<Series> {}
