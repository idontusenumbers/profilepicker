(function($) {
    // TODO on the first load of the camera, it hangs while 'finding resolutions'
    var TRANSFORM_ATTRIBUTE = 'data-transform';

    var coalesce = function(countval, func, wait) {
        var timeout;
        var count = 0;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                clearTimeout(timeout);
                timeout = null;
                if (count) {
                    var callArgs = [].slice.call(args);
                    [].push.call(callArgs, count);
                    func.apply(context, callArgs);
                    count = 0;
                }
            };
            count += countval.apply(context, args);
            if (!timeout) {
                later();
                timeout = setTimeout(later, wait);
            }
        };
    };
    var setTransform = function($dest, destContext, srcContext, scale, x, y) {
        $dest.attr(TRANSFORM_ATTRIBUTE, 'matrix(' + scale + ', 0,0,' + scale + ',' + x + ',' + y + ')');

        destContext.setTransform(scale, 0, 0, scale, x, y);
        destContext.drawImage(srcContext.canvas, 0, 0);
    }
    var applyTransform = function($container, srcContext, destContext, ds, dx, dy) {
        var $src = $(srcContext.canvas);
        var $dest = $(destContext.canvas);
        var transform = $dest.attr(TRANSFORM_ATTRIBUTE);
        var scale = 1, x = 0, y = 0;
        if (transform) {
            var t = transform.match(
                /matrix\((-?\d*\.?\d+),\s*0,\s*0,\s*\d*\.?\d+,\s*(-?\d+.?\d*).*?,\s*(-?\d+.?\d*).*?\)/);
            scale = parseFloat(t[1]), x = parseFloat(t[2]), y = parseFloat(t[3]);
        }
        if (isNaN(scale))
            scale = 1;
        var iw = $src[0].width; // original image width
        var ih = $src[0].height;
        var cw = $container[0].clientWidth; // container width
        var ch = $container[0].clientHeight;
        var sw = (iw * scale); // scale width
        var sh = (ih * scale);

        var newScale = Math.min(1.5, Math.max(scale + ds,
            cw / iw,
            ch / ih));

        if (ds) {
            if (newScale != scale) {
                x = (x - cw / 2) / scale * newScale + cw / 2;
                y = (y - ch / 2) / scale * newScale + ch / 2;
                scale = newScale;
                // recalc scale width
                sw = (iw * scale);
                sh = (ih * scale);
            }
        } else {
            x += dx + x * ds;
            y += dy + y * ds;
        }

        var xmax = sw - cw;
        var ymax = sh - ch;
        x = Math.max(-xmax, Math.min(0, x));
        y = Math.max(-ymax, Math.min(0, y));

        setTransform($dest, destContext, srcContext, scale, x, y);
    }
    var isDroppable = function(ev) {
        var dt = ev.originalEvent.dataTransfer;
        if (dt && dt.items) {
            var i = dt.items["0"];
            return i.kind == 'file' && (i.type == "application/x-moz-file" || i.type.startsWith('image'));
        }
        return false;
    };

    var setup = function($photoUpload) {
        var uploadName = $photoUpload.attr('data-photo-upload-name');
        var uploadUrl = $photoUpload.attr('data-photo-upload-url');
        var $progress = $photoUpload.find('.progress');
        var $filename = $photoUpload.find('.filename');
        var $file = $photoUpload.find('input[type=file]');
        var $clear = $photoUpload.find('button.clear');
        var $useCamera = $photoUpload.find('button.use-camera');
        var $status = $photoUpload.find('.status');
        var $tip = $photoUpload.find('.tip');
        var $hidden = $photoUpload.find('input[name=' + uploadName + ']');
        var $video = $photoUpload.find('video');
        var $offscreenCanvas = $photoUpload.find('canvas.offscreen');
        var $resultCanvas = $photoUpload.find('canvas.result');
        var $imageCanvas = $photoUpload.find('canvas.image');
        var $image = $photoUpload.find('.img-container img');

        var size = { width: $photoUpload[0].clientWidth, height: $photoUpload[0].clientHeight }; // 5

        var offscreenContext = $offscreenCanvas[0].getContext('2d');
        var resultContext = $resultCanvas[0].getContext('2d');
        var imageContext = $imageCanvas[0].getContext('2d');

        var htracker = new headtrackr.Tracker({
            calcAngles: false,
            ui: false,
            headPosition: false,
            smoothing: false,
            whitebalancing: false,
            detectionInterval: 15,
        });

        var diff = function(a, b) { return Math.abs((a - b) / b); }
        var scale = 0;
        var captured = false;
        var foundFace = false;
        var previewAspectRatio;
        var faceEvent;
        var dragX = 0;
        var dragY = 0;


        var reset = function() {
            $file.val('');
            $photoUpload.removeClass('success error streaming uploading');
            $status.text('');
            $tip.text('');
            $filename.text('');
            $imageCanvas.attr(TRANSFORM_ATTRIBUTE, '');
            $imageCanvas[0].width = 0;
            $resultCanvas[0].width = 0;
            $offscreenCanvas[0].width = 0;
            foundFace = false;
            captured = false;
            faceEvent = null;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                $useCamera.hide();
                $status.text("No video support");
            }
        };

        var getVideoAspectRatio = function(callback) {
            // The user is asked twice about the camera when running from a file or from an insecure server, it asks twice.

            var res1080p = { width: 1920, height: 1080 }; // 5

            navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { optional: [{ minWidth: res1080p.width }, { minHeight: res1080p.height }] }
            }).then(function(stream) {
                var tryCount = 0;
                var video = $video[0];
                video.srcObject = stream;
                var interval = setInterval(function() {
                    if (tryCount > 100){

                        clearInterval(interval);
                        $status.text("Could not determine aspect ratio");
                        video.srcObject=null;
                    }
                    tryCount++;
                    var w = video.videoWidth;
                    var h = video.videoHeight;
                    var videoAr = w / h;
                    if (!isNaN(videoAr)) {
                        clearInterval(interval);
                        video.remove();
                        var tracks = stream.getTracks();
                        for (var track in tracks) {
                            tracks[track].stop();
                        }
                        callback(videoAr);
                    }
                }, 15);
            }).catch(function(err) {
                console.error(err);
                $status.text("Error: " + err.name + "; " + err.message);
                $('<br/><a href="#">reset</a>').on('click', function(ev) {
                    ev.preventDefault();
                    reset();
                }).appendTo($status);
            });


        };

        var trySetTransformFromRect = function(x, y, w, h, angle) {
            var cdW = $offscreenCanvas.width();
            var cdH = $offscreenCanvas.height();
            var cW = $photoUpload[0].clientWidth;
            var cH = $photoUpload[0].clientHeight;

            var newScale = Math.max(Math.max(cW / cdW, cH / cdH), Math.min(cW / w, cH / h) * .8);
            if (diff(scale, newScale) > .03)
                scale = newScale;


            //offscreenContext.translate(x, y);
            //offscreenContext.rotate(angle - (Math.PI / 2));

            var tY = -y * scale + cH / 2;
            var tX = -x * scale + cW / 2;

            setTransform($resultCanvas, resultContext, offscreenContext, scale,
                Math.min(0, Math.max(cW - cdW * scale, tX)),
                Math.min(0, Math.max(cH - cdH * scale, tY)));

            setTransform($imageCanvas, imageContext, offscreenContext, scale,
                Math.min(0, Math.max(cW - cdW * scale, tX)),
                Math.min(0, Math.max(cH - cdH * scale, tY)));

            // draw debug information
          //offscreenContext.strokeStyle = "#00CC00";
          //offscreenContext.strokeRect((-(w / 2)) >> 0, (-(h / 2)) >> 0, w, h);

            //offscreenContext.resetTransform();
        };

        var loadImageFromDataUrl = function(dataUrl, callback) {
            var img = new Image();
            img.onload = function() {
                // TODO reduce size of large images
                var w = img.width;
                var h = img.height;
                var cw = $photoUpload[0].clientWidth; // container width
                var ch = $photoUpload[0].clientHeight;
                var s = 1 - Math.max(cw / w, ch / h);
                $offscreenCanvas[0].width = w;
                $offscreenCanvas[0].height = h;
                $imageCanvas[0].width = w;
                $imageCanvas[0].height = h;

                offscreenContext.drawImage(img, 0, 0);
                $imageCanvas.attr(TRANSFORM_ATTRIBUTE,
                    'matrix(1,0,0,1,' + (-(w - cw) / 2) + ',' + (-(h - ch) / 2) + ')');
                applyTransform($photoUpload, offscreenContext, imageContext, -s, 0, 0);
                $photoUpload.removeClass('uploading').addClass('success');
                $status.text('');
                if (callback)
                    callback();
            };
            img.src = dataUrl;
        };

        var uploadComplete = function(filename) {
            $status.text('');
            $hidden.val(filename);
        };

        var useFiles = function(files) {
            var form = $('<form>')[0];
            var ajaxData = new FormData(form);
            $photoUpload.addClass('uploading');
            $status.text('Reading image...');
            var reader = new FileReader();
            var file = files[0];
            $filename.text(file.name);

            reader.onload = function(readEvent) {
                loadImageFromDataUrl(readEvent.target.result, function() {
                    // TODO try to find face on drop
                    $status.text('Detecting face...');
                    setTimeout(function() {
                        var t = new headtrackr.facetrackr.Tracker({ whitebalancing: false });
                        t.init($offscreenCanvas[0]);
                        for (var i = 0; i < 2; i++) { // two iterations, JV, CS
                            t.track();
                        }
                        $status.text('');
                    }, 0);

                    //trySetTransformFromRect(r.x, r.y, r.width, r.height);
                });

            }
            reader.readAsDataURL(files[0]);
            return;

            // TODO this doesnt work with multiple files well
            // only allow one
            $.each(files,
                function(i, file) {
                    ajaxData.append('fileupload', file);
                    $filename.text(file.name);
                });

            reset();
            $photoUpload.addClass('uploading');


            var jqxhr = $.ajax({
                url: uploadUrl,
                type: 'POST',
                data: ajaxData,
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                xhr: function() {
                    var xhr = new window.XMLHttpRequest();
                    var progressHandler = function(ev) {
                        if (ev.lengthComputable) {
                            var percent = ev.loaded / ev.total;
                            $progress.css({ width: percent * 100 + '%' });
                        }
                    };

                    //Upload progress
                    xhr.upload.addEventListener('progress', progressHandler, false);
                    //Download progress
                    xhr.addEventListener('progress', progressHandler, false);
                    return xhr;
                },
                complete: function() {
                    $photoUpload.removeClass('uploading');
                    $progress.css({ width: 0 });
                },
                success: function(data) {
                    $photoUpload.addClass('success');
                    uploadComplete(data.filename);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    $photoUpload.addClass('error');
                    $status.text(textStatus + ' ' + errorThrown);
                }
            });
        };


        document.addEventListener('facetrackingEvent', function(event) {
            if (event.detection == 'CS') {
                foundFace = true;
                $status.text('');
                faceEvent = event;
            }
            if (faceEvent)
                trySetTransformFromRect(faceEvent.x, faceEvent.y, faceEvent.width, faceEvent.height, faceEvent.angle);

        });
        document.addEventListener('headtrackrStatus', function(event) {
            if (event.status == 'whitebalance' || event.status == 'detecting') {
                captured = true;
                $status.text('Finding face...');
            }
        });

        $useCamera.on('click', function(ev) {
            ev.preventDefault();
            reset();
            $photoUpload.addClass('streaming');
            $status.text('Detecting resolution...');
            getVideoAspectRatio(function(aspectRatio) {
                previewAspectRatio = { width: 1080 * aspectRatio, height: 1080 };
                $video.attr(previewAspectRatio); // headtrakr will use this size for the camera settings
                $offscreenCanvas.attr(previewAspectRatio);
                $imageCanvas.attr(previewAspectRatio);
                $resultCanvas.attr(size);

                $status.text('Displaying stream...');
                $tip.text('Click to capture');
                faceEvent = {
                    x: previewAspectRatio.width / 2,
                    y: previewAspectRatio.height / 2,
                    width: previewAspectRatio.width,
                    height: previewAspectRatio.height,
                };

                htracker.init($video[0], $offscreenCanvas[0]);
                htracker.start();
            });
        }).on('mousedown', function(ev) {
            ev.stopPropagation();
        });;

        $resultCanvas.on('click', function(ev) {
            // TODO clicking before the stream starts causes blank image
            var killInterval = setInterval(function() {
                if (captured) {

                    htracker.stop();
                    htracker.stopStream();

                    $photoUpload.removeClass('streaming');
                    $photoUpload.addClass('success');
                    $hidden.removeAttr('disabled');
                    $filename.text('Camera');
                    $tip.text('');
                    $status.text('');
                    clearInterval(killInterval);
                }
            }, 1000 / 60);

        });

        $file.on('change', function(ev) {
            useFiles(ev.originalEvent.target.files);
        });

        $clear.on('click', function(ev) {
            ev.preventDefault();
            $hidden.removeAttr('disabled');
            reset();
        }).on('mousedown', function(ev) {
            ev.stopPropagation();
        });

        $photoUpload.on('drag dragstart dragend dragover dragenter dragleave drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
        }).on('dragover dragenter', function(ev) {
            if (isDroppable(ev))
                $photoUpload.addClass('dragover');
        }).on('dragleave dragend drop', function(ev) {
            $photoUpload.removeClass('dragover');
        }).on('drop', function(ev) {
            ev.preventDefault();
            $photoUpload.removeClass('dragover');
            var dt = ev.originalEvent.dataTransfer;
            if (dt && dt.files) {
                if (isDroppable(ev)) {
                    useFiles(dt.files);

                    // TODO clear files so form doesn't submit them?
                }
            }
        }).on('mousedown touchstart', function(ev) {
            if ($photoUpload.is('.success:not(.streaming)') && ev.target == $imageCanvas[0]) {

                var oe = ev.originalEvent;
                if (ev.type == 'touchstart') {
                    var touch = oe.changedTouches[0];
                    dragX = touch.screenX;
                    dragY = touch.screenY;
                } else {
                    if (ev.buttons != 1)
                        return;
                    dragX = oe.screenX;
                    dragY = oe.screenY;
                }

                $photoUpload.addClass('moving');
                ev.preventDefault();
            }

        }).on('wheel', coalesce(function(ev) {
            ev.preventDefault();
            return -ev.originalEvent.deltaY;
        }, function(ev, count) {
            applyTransform($photoUpload, offscreenContext, imageContext, .0001 * count, 0, 0);
        }, 15));

        $(document).on('mousemove touchmove', function(ev) {
            if ($photoUpload.is('.moving')) {
                var moveX;
                var moveY;
                var oe = ev.originalEvent;
                if (ev.type == 'touchmove') {
                    var touch = oe.changedTouches[0];
                    moveX = touch.screenX - dragX;
                    moveY = touch.screenY - dragY;
                    dragX = touch.screenX;
                    dragY = touch.screenY;
                } else {
                    moveX = oe.screenX - dragX;
                    moveY = oe.screenY - dragY;
                    dragX = oe.screenX;
                    dragY = oe.screenY;
                }
                //ev.preventDefault();
                applyTransform($photoUpload, offscreenContext, imageContext, 0, moveX, moveY);
            }
        }).on('mouseup touchend', function(ev) {
            $photoUpload.removeClass('moving');
        });

        $photoUpload.closest('form').on('submit', function(ev) {
            // TODO this effectively crops it, maybe we want to keep the original?
            try {
                if ($photoUpload.is('.success')) {
                    var canvas = document.createElement('canvas');

                    var transform = $imageCanvas.attr(TRANSFORM_ATTRIBUTE);
                    var scale = 1, x = 0, y = 0;
                    if (transform) {
                        var t = transform.match(
                            /matrix\((-?\d*\.?\d+),\s*0,\s*0,\s*\d*\.?\d+,\s*(-?\d+.?\d*).*?,\s*(-?\d+.?\d*).*?\)/);
                        scale = parseFloat(t[1]), x = parseFloat(t[2]), y = parseFloat(t[3]);
                        var w = $photoUpload[0].clientWidth / scale;
                        var h = $photoUpload[0].clientHeight / scale;
                    }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage($offscreenCanvas[0], -x / scale, -y / scale, w, h, 0, 0, w, h);
                    $hidden.val(canvas.toDataURL('image/jpeg'));
                } else {
                    $hidden.val('');
                }
            } catch (ex) {
                ev.preventDefault();
                console.error(ex);
            }
        });

        reset();
        if ($image.length > 0)
            loadImageFromDataUrl($image.attr('src'), function() { $image.remove(); });


    }


    $('.photo-upload').each(function() {
        setup($(this));
    });


})(jQuery);