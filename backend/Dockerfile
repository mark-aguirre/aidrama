# syntax=docker/dockerfile:1

# Multi-stage build for the AI Drama Spring Boot backend.
# Produces a small runtime image from a JRE and the packaged fat jar.
# Build with the deploy-to-docker.sh script or directly:
#   docker build -t aidrama-backend .
#   docker run --env-file .env -p 8080:8080 aidrama-backend
#
# The jar reads all config from the environment (see .env.example). Nothing
# secret is baked into the image; pass the values at `docker run` time.

# ---- Build --------------------------------------------------------------
# Maven 3.9 + Temurin JDK 21 (matches pom.xml java.version).
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app

# Resolve dependencies first so they cache when only sources change.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

# The tests copy db/changelog from ../db; it is outside this build context, so
# build the jar without running tests here (run `mvn verify` in CI instead).
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---- Runner -------------------------------------------------------------
# JRE only: smaller image, no build tools in the runtime.
FROM eclipse-temurin:21-jre AS runner
WORKDIR /app

ENV PORT=8080

# Run as a non-root user.
RUN groupadd --system --gid 1001 spring \
  && useradd --system --uid 1001 --gid spring spring

# Copy the single application jar produced by the build.
COPY --from=builder /app/target/aidrama-backend-*.jar app.jar

USER spring

EXPOSE 8080

CMD ["java", "-jar", "app.jar"]
