var gulp = require("gulp");
var browserSync = require("browser-sync");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var buffer = require("vinyl-buffer");
var Vinyl = require("vinyl");
var glob = require("glob");
var uglify = require("gulp-uglify");
var rename = require("gulp-rename");
var gutil = require("gulp-util");
var newer = require("gulp-newer");
var data = require("gulp-data");
var imageminOptipng = require("imagemin-optipng");
var jade = require("gulp-jade");
var yazl = require("yazl");
var imageminPngquant = require("imagemin-pngquant");
var rsync = require("rsyncwrapper");
var debounce = require("debounce");
var asyncDone = require("async-done");
const { Readable } = require("stream");

var meta = require("./package.json");

const BUILD_DIR_DEV = "build/dev/";
const BUILD_DIR_RELEASE = "build/release/";

function serve(openBrowser) {
    browserSync({
        server: {
            baseDir: "build/dev/demos/"
        },
        ghostMode: false,
        open: openBrowser
    });
    // fugly hack to work around reloads being triggered before
    // writes are complete
    var reload = debounce(browserSync.reload, 1000);
    gulp.watch(["src/*.js", "src/shaders/*.glsl"], ["build"]);
    gulp.watch(["demos/*.jade"], ["buildHtml"]);
    gulp.watch(["demos/gfx/*/*.png", "demos/*.{js,css}"], ["copyAssets"]);
    gulp.watch(["**/*"], { cwd: "build/dev/demos/" }, reload);
    gulp.watch(["**/*"], { cwd: "dist/tests/" }, reload);
}

function buildJavascript(release, dest) {
    console.log("building " + meta.name + "@" + meta.version);
    var b = browserify({
        entries: meta.main,
        standalone: meta.name,
        debug: true
        // insertGlobals: !release
    });
    console.log("browserifying");
    var vinyl = new Vinyl({
        path: meta.name + ".js",
        contents: b.bundle().on("error", function(error) {
            console.log(error.toString());
            stream.end();
        })
    });
    let i = 0;
    let stream = new Readable({
        objectMode: true,
        read(size) {
            this.push(i++ ? null : vinyl);
        }
    })
        .on("error", function(error) {
            console.log(error.toString());
            stream.end();
        })
        // .pipe(source(meta.name + ".js"))
        .pipe(buffer())
        .on("error", gutil.log)
        .pipe(gulp.dest(dest));

    if (release) {
        stream = stream
            .pipe(
                uglify({
                    compress: {
                        unsafe: true,
                        screw_ie8: true
                    },
                    mangle: {
                        screw_ie8: true
                    },
                    output: {
                        screw_ie8: true
                    }
                })
            )
            .pipe(rename({ extname: ".min.js" }))
            .pipe(gulp.dest(dest));
    }
    return stream;
}
gulp.task("buildJavascript", buildJavascript.bind(null, false, BUILD_DIR_DEV));

function copyImages(src, dest, compress) {
    var stream = gulp.src(src, { base: "." }).pipe(newer(dest));

    if (compress === "quantize") {
        stream = stream.pipe(imageminPngquant()());
    } else if (compress === "optimize") {
        stream = stream.pipe(imageminOptipng({ optimizationLevel: 7 })());
    }

    return stream.pipe(gulp.dest(dest));
}

function copyAssets(release, dest) {
    console.log("copyAssets");
    return streamsToPromise([
        copyImages(
            ["demos/gfx/*/{ambient,baseColor,material}.png"],
            dest,
            release && "quantize"
        ),
        copyImages(["demos/gfx/*/normal.png"], dest, release && "optimize"),
        gulp.src(["demos/*.{js,css,gif}"], { base: "." }).pipe(gulp.dest(dest)),
        gulp.src(["src/jquery.normalmap.js"]).pipe(gulp.dest(dest))
    ]).then(function() {
        return streamToPromise(
            gulp
                .src([dest + "?(jquery.)normalmap.js"])
                .pipe(gulp.dest(dest + "demos/"))
        );
    });
}
gulp.task("copyAssets", copyAssets.bind(this, false, BUILD_DIR_DEV));

function buildHtml(release, dest) {
    console.log("building html", release);
    var stream = gulp
        .src(["demos/*.jade", "!demos/_*.jade"])
        .pipe(
            data(function(file) {
                return {
                    meta: meta,
                    release: release,
                    baseName: gutil
                        .replaceExtension(path.basename(file.path), ".html")
                        .replace("index.html", ""),
                    fileRev: release ? fileRev.bind(this, dest) : identity
                };
            })
        )
        .pipe(
            jade({
                pretty: true
            })
        )
        .on("error", function(e) {
            gutil.log(e);
            stream.end();
        })
        .pipe(gulp.dest(dest));
    return stream;
}
gulp.task(
    "buildHtml",
    gulp.series(
        "copyAssets",
        buildHtml.bind(this, false, BUILD_DIR_DEV + "demos")
    )
);

function build(release, dest, releaseJavascript) {
    return streamToPromise(buildJavascript(release || releaseJavascript, dest))
        .then(copyAssets.bind(null, release, dest))
        .then(buildHtml.bind(null, release, dest + "demos/"));
}
gulp.task("build", build.bind(this, false, BUILD_DIR_DEV));
gulp.task("buildRelease", build.bind(this, true, BUILD_DIR_RELEASE));

gulp.task(
    "open",
    gulp.series("build", function() {
        return serve(true);
    })
);

gulp.task(
    "default",
    gulp.series("build", function() {
        return serve();
    })
);

gulp.task(
    "release",
    gulp.series("buildRelease", function(done) {
        rsync(
            {
                src: "build/release/demos/",
                recursive: true,
                exclude: [".*"],
                dest: "/var/www/static/sandbox/2016/normalmap.js/",
                host: "x.29a.ch",
                port: "22",
                args: ["--copy-links"],
                dryRun: false
            },
            function(error, stdout, stderr, cmd) {
                console.log(cmd);
                if (error) {
                    console.trace(error);
                    console.warn(stderr);
                }
                console.log(stdout);
                done();
            }
        );
    })
);

gulp.task(
    "dist",
    gulp.series("buildRelease", function() {
        return gulp.src(["build/release/*.js"]).pipe(gulp.dest("dist/"));
    })
);

gulp.task("zip", function() {
    // Symlink handling in gulp/vinyl-fs is not helpful
    // so I'm using yazl directly
    return build(false, BUILD_DIR_DEV, true).then(function() {
        var name = meta.name + "-" + meta.version;
        var zipFile = new yazl.ZipFile();
        var globOptions = {
            dot: false,
            follow: true,
            mark: true,
            ignore: ["**/*.cache-*"]
        };

        glob(BUILD_DIR_DEV + "**/*", globOptions, function(e, files) {
            if (e) {
                stream.emit("error", e);
            }
            files.forEach(function(file) {
                if (file[file.length - 1] == "/") return;
                console.log(file);
                zipFile.addFile(
                    file,
                    file.replace(BUILD_DIR_DEV, meta.name + "/")
                );
            });
            zipFile.end();
        });

        ["README.md", "doc/API.md", "doc/CHANGELOG.md"].forEach(function(file) {
            zipFile.addFile(file, meta.name + "/" + file.replace("doc/", ""));
        });

        var stream = zipFile.outputStream.pipe(
            fs.createWriteStream("build/zip/" + name + ".zip")
        );

        return streamToPromise(stream);
    });
});

function streamToPromise(stream) {
    return new Promise(function(resolve, reject) {
        asyncDone(identity.bind(null, stream), function(e) {
            if (e) return reject(e);
            resolve(stream);
        });
    });
}

function streamsToPromise(streams) {
    return Promise.all(streams.map(streamToPromise));
}

var fs = require("fs"),
    path = require("path"),
    crypto = require("crypto");

function fileRev(root, fileName) {
    var filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) {
        return fileName;
    }
    var buffer = fs.readFileSync(filePath),
        hash = crypto.createHash("md5");

    hash.update(buffer);

    var digest = hash.digest("hex").slice(0, 16);
    var fileNameRev = fileName.replace(/([^.\/]+)$/, "cache-" + digest + ".$1");
    var filePathRev = path.join(root, fileNameRev);

    if (!fs.existsSync(filePathRev)) {
        fs.writeFileSync(filePathRev, buffer);
        console.log("Copied " + filePath + " to " + filePathRev);
    }
    return fileNameRev;
}

function identity(x) {
    return x;
}
