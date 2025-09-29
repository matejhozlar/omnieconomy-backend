import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import winston from "winston";

type LogLevel =
  | "error"
  | "warn"
  | "info"
  | "http"
  | "verbose"
  | "debug"
  | "silly";

const LOG_DIR = "logs";
const DATE_FORMAT = "sv-SE";

function getDateString(): string {
  return new Date().toLocaleDateString(DATE_FORMAT);
}

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v as object)) return "[Circular]";
          seen.add(v as object);
        }
        return v;
      },
      2
    );
  } catch {
    return String(value);
  }
}

function toPrintable(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === "object") return safeStringify(arg);
  return String(arg);
}

export class DailyRotatingConsoleLogger {
  private currentDate: string;
  private logger: winston.Logger;
  private interval: NodeJS.Timeout | null = null;
  private daysToKeep: number;

  constructor(options?: { daysToKeep?: number }) {
    this.daysToKeep = options?.daysToKeep ?? 7;
    this.currentDate = getDateString();
    this.logger = this.createLoggerForDate(this.currentDate);
    this.monitorDateChange();
  }

  private getLogPathForDate(date: string, filename: string): string {
    const datedDir = path.join(LOG_DIR, date);
    ensureDirSync(datedDir);
    return path.join(datedDir, filename);
  }

  private createLoggerForDate(date: string): winston.Logger {
    ensureDirSync(LOG_DIR);

    const baseFormat = winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${String(level).toUpperCase()}] ${message}`;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.File({
        filename: this.getLogPathForDate(date, "server.log"),
        level: "info",
      }),
      new winston.transports.File({
        filename: this.getLogPathForDate(date, "errors.log"),
        level: "error",
      }),
      new winston.transports.Console({}),
    ];

    const exceptionHandlers: winston.transport[] = [
      new winston.transports.File({
        filename: this.getLogPathForDate(date, "exceptions.log"),
      }),
    ];

    const rejectionHandlers: winston.transport[] = [
      new winston.transports.File({
        filename: this.getLogPathForDate(date, "rejections.log"),
      }),
    ];

    return winston.createLogger({
      level: "info",
      format: baseFormat,
      transports,
      exceptionHandlers,
      rejectionHandlers,
      exitOnError: false,
    });
  }

  private async cleanOldLogFolders(daysToKeep: number): Promise<void> {
    try {
      const entries = await fsPromises.readdir(LOG_DIR, {
        withFileTypes: true,
      });
      const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

      await Promise.all(
        entries
          .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
          .map(async (d) => {
            const folderDate = new Date(d.name).getTime();
            if (!Number.isNaN(folderDate) && folderDate < cutoff) {
              const folderPath = path.join(LOG_DIR, d.name);
              try {
                await fsPromises.rm(folderPath, {
                  recursive: true,
                  force: true,
                });
                console.log(`Deleted old log folder: ${d.name}`);
              } catch (rmErr) {
                console.warn(
                  `Failed to delete old log folder ${d.name}:`,
                  rmErr
                );
              }
            }
          })
      );
    } catch (e) {
      console.error("Failed to scan logs dir for cleanup:", e);
    }
  }

  private monitorDateChange(): void {
    this.interval = setInterval(async () => {
      const newDate = getDateString();
      if (newDate !== this.currentDate) {
        for (const t of this.logger.transports) {
          try {
            if (typeof t.close === "function") t.close();
          } catch {}
        }
        this.logger.close();

        this.currentDate = newDate;
        this.logger = this.createLoggerForDate(this.currentDate);

        void this.cleanOldLogFolders(this.daysToKeep);
      }
    }, 60 * 1000);
  }

  private formatArgs(...args: unknown[]): string {
    return args.map(toPrintable).join(" ");
  }

  public log(level: LogLevel, ...args: unknown[]): void {
    this.logger.log(level, this.formatArgs(...args));
  }

  public error(...args: unknown[]): void {
    this.logger.error(this.formatArgs(...args));
  }

  public warn(...args: unknown[]): void {
    this.logger.warn(this.formatArgs(...args));
  }

  public info(...args: unknown[]): void {
    this.logger.info(this.formatArgs(...args));
  }

  public debug(...args: unknown[]): void {
    this.logger.debug(this.formatArgs(...args));
  }

  public setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  public async close(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await Promise.allSettled(
      this.logger.transports.map(
        (t) =>
          new Promise<void>((resolve) => {
            try {
              if (typeof t.close === "function") t.close();
            } finally {
              resolve();
            }
          })
      )
    );
    this.logger.close();
  }
}
export const logger = new DailyRotatingConsoleLogger();
export default logger;
