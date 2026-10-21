import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import type { Express, NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Authenticated responses contain user/tenant-scoped state. Do not allow ETag
  // revalidation to turn these live API reads into browser-cached 304 responses.
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable("etag");
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    next();
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("BACKEND_PORT");

  if (process.env.HTTP_LOGGING === "true") {
    const logger = new Logger("Http");
    app.use((request: Request, response: Response, next: NextFunction) => {
      const startedAt = performance.now();
      response.on("finish", () => {
        const details = `${request.method} ${request.path} ${response.statusCode} ${Math.round(performance.now() - startedAt)}ms`;
        if (response.statusCode >= 500) logger.error(details);
        else if (response.statusCode >= 400) logger.warn(details);
        else logger.log(details);
      });
      next();
    });
    logger.log("HTTP request logging enabled; request bodies, cookies, and query strings are excluded.");
  }

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
