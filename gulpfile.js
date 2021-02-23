// Sass configuration
const gulp = require("gulp");
// const sass = require("gulp-sass");
// const plumber = require("gulp-plumber");
const workboxBuild = require("workbox-build");
const del = require("del");
const packageJSON = require("./package.json");
const echomdVersion = packageJSON.dependencies["@0xgg/echomd"];

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
  del.sync(`./public/styles/echomd*`);
  gulp
    .src(["./node_modules/@0xgg/echomd/theme/**/*"])
    .pipe(gulp.dest(`./public/styles/echomd@${echomdVersion}/`));
  cb();
});

gulp.task("service-worker", () => {
  return workboxBuild
    .injectManifest({
      swSrc: "src/sw.js",
      swDest: "build/service-worker.js",
      globDirectory: "build",
      globPatterns: ["**/*.{js,css,html,png,svg,woff2}"], // We ignore eot,ttf,woff and only support woff2 font
      globIgnores: ["assets/apple-*"],
      maximumFileSizeToCacheInBytes: 1024 * 1024 * 8, // 8mb
      mode: "production",
    })
    .then(({ count, size, warnings }) => {
      // Optionally, log any warnings and details.
      warnings.forEach(console.warn);
      console.log(`${count} files will be precached, totaling ${size} bytes.`);
    });
});
