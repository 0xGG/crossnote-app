// Sass configuration
var gulp = require("gulp");
var sass = require("gulp-sass");

const src = "./public/styles/**/*.scss";
gulp.task("sass", function (cb) {
  gulp
    .src(src)
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
