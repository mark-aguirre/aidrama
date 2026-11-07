package com.aidrama;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/** AI Drama MVP thin-slice API: signup, upload, process, watch. */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class AiDramaApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiDramaApplication.class, args);
    }
}
