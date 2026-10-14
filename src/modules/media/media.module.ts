import { Module, UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Media } from './entities/media.entity';
import { MediaController } from './media.controller';
import { ALLOWED_TRIP_MEDIA_TYPES, UPLOAD_DIR, UPLOAD_DIR_TOKEN } from './media.constants';
import { MediaService } from './media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media, User]),
    // Files are held in memory (no storage option) and written to disk by MediaService only
    // after the request is validated, so rejected uploads never leave files behind.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: Math.floor(config.get<number>('upload.maxFileSizeMb', 5) * 1024 * 1024),
          files: 10, // trip gallery takes several; single-file routes still accept one
        },
        fileFilter: (_req, file, cb) => {
          if (file.mimetype in ALLOWED_TRIP_MEDIA_TYPES) return cb(null, true);
          cb(
            new UnsupportedMediaTypeException(
              `Only ${Object.keys(ALLOWED_TRIP_MEDIA_TYPES).join(', ')} media files are allowed`,
            ),
            false,
          );
        },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, { provide: UPLOAD_DIR_TOKEN, useValue: UPLOAD_DIR }],
  // MulterModule is re-exported so other modules' FileInterceptors use the same limits and filter.
  exports: [MediaService, MulterModule],
})
export class MediaModule {}
