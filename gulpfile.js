// Sass configuration
const gulp = require("gulp");
const sass = require("gulp-sass");
const plumber = require("gulp-plumber");

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
