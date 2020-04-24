// Sass configuration
const gulp = require("gulp");
// const sass = require("gulp-sass");
// const plumber = require("gulp-plumber");
const workboxBuild = require("workbox-build");

//const src = "./public/styles/**/*.scss";
/*
gulp.task("sass", function (cb) {
  gulp
    .src(src)
    .pipe(plumber())
    .pipe(sass())
    .pipe(
      gulp.dest(function (f) {
        return f.base;
      }),
    );
  cb();
});

gulp.task(
  "default",
  gulp.series("sass", function (cb) {
    gulp.watch(src, gulp.series("sass"));
    cb();
  }),
);

gulp.task(
  "build",
  gulp.series("sass", function (cb) {
    cb();
  }),
);
*/

gulp.task("copy-css-files", function (cb) {
  gulp
    .src(["./node_modules/vickymd/theme/**/*"])
    .pipe(gulp.dest("./public/styles/"));
  cb();
});

gulp.task("service-worker", () => {
  return workboxBuild
    .injectManifest({
      swSrc: "src/sw.js",
      swDest: "build/service-worker.js",
      globDirectory: "build",
      globPatterns: ["**/*.{js,css,html,png,tff,woff,woff2}"],
      maximumFileSizeToCacheInBytes: 1024 * 1024 * 8, // 8mb
      mode: "production",
    })
    .then(({ count, size, warnings }) => {
      // Optionally, log any warnings and details.
      warnings.forEach(console.warn);
      console.log(`${count} files will be precached, totaling ${size} bytes.`);
    });
});
