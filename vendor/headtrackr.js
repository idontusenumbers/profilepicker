/**
 * headtrackr library (https://www.github.com/auduno/headtrackr/)
 *
 * Copyright (c) 2012, Audun Mathias Øygard
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * This library includes code from Liu Liu's ccv library (https://github.com/liuliu/ccv)
 * and ported code from Benjamin Jung's FaceIt actionscript library (http://www.libspark.org/browser/as3/FaceIt/trunk/src/org/libspark/faceit/camshift/Tracker.as)
 *
 * ccv library license:
 *
 * Copyright (c) 2010, Liu Liu
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * * Neither the name of the authors nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * FaceIt library license:
 *
 * Copyright (C)2009 Benjamin Jung
 * 
 * Licensed under the MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

(function(root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.headtrackr = factory();
    }
}(this, function() {
/**
 * Wrapper for headtrackr library
 *
 * Usage:
 *	var htracker = new headtrackr.Tracker();
 *	htracker.init(videoInput, canvasInput);
 *	htracker.start();
 *
 * Optional parameters can be passed to Tracker like this:
 *	 new headtrackr.Tracker({ ui : false, altVideo : "somevideo.ogv" });
 *
 * Optional parameters:
 *	ui {boolean} : whether to create messageoverlay with messages like "found face" (default is true)
 *	altVideo {object} : urls to any alternative videos, if camera is not found or not supported
 *		the format is : {'ogv' : 'somevideo.ogv', 'mp4' : 'somevideo.mp4', 'webm' : 'somevideo.webm'}
 *	smoothing {boolean} : whether to use smoothing (default is true)
 *	debug {canvas} : pass along a canvas to paint output of facedetection, for debugging
 *	detectionInterval {number} : time we wait before doing a new facedetection (default is 20 ms)
 *	retryDetection {boolean} : whether to start facedetection again if we lose track of face (default is true)
 *	fov {number} : horizontal field of view of used camera in degrees (default is to estimate this)
 *	fadeVideo {boolean} : whether to fade out video when face is detected (default is false)
 *	cameraOffset {number} : distance from camera to center of screen, used to offset position of head (default is 11.5)
 *	calcAngles {boolean} : whether to calculate angles when doing facetracking (default is false)
 *	headPosition {boolean} : whether to calculate headposition (default is true)
 *
 * @author auduno / github.com/auduno
 */

    var headtrackr = {};
    headtrackr.rev = 2;

/**
 * @constructor
 */
    headtrackr.Tracker = function(params) {

        if (!params) params = {};

        if (params.smoothing === undefined) params.smoothing = true;
        if (params.retryDetection === undefined) params.retryDetection = true;
        if (params.ui === undefined) params.ui = true;
        if (params.debug === undefined) {
            params.debug = false;
        } else {
            if (params.debug.tagName != 'CANVAS') {
                params.debug = false;
            } else {
                var debugContext = params.debug.getContext('2d');
            }
        }
        if (params.detectionInterval === undefined) params.detectionInterval = 20;
        if (params.fadeVideo === undefined) params.fadeVideo = false;
        if (params.cameraOffset === undefined) params.cameraOffset = 11.5;
        if (params.calcAngles === undefined) params.calcAngles = false;
        if (params.headPosition === undefined) params.headPosition = true;

        var ui, smoother, facetracker, headposition, canvasContext, videoElement, detector;
        var detectionTimer;
        var fov = 0;
        var initialized = true;
        var run = false;
        var faceFound = false;
        var firstRun = true;
        var videoFaded = false;
        var headDiagonal = [];

        this.status = "";
        this.stream = undefined;

        var statusEvent = document.createEvent("Event");
        statusEvent.initEvent("headtrackrStatus", true, true);

        var headtrackerStatus = function(message) {
            statusEvent.status = message;
            document.dispatchEvent(statusEvent);
            this.status = message;
        }.bind(this);

        var insertAltVideo = function(video) {
            if (params.altVideo !== undefined) {
                if (supports_video()) {
                    if (params.altVideo.ogv && supports_ogg_theora_video()) {
                        video.src = params.altVideo.ogv;
                    } else if (params.altVideo.mp4 && supports_h264_baseline_video()) {
                        video.src = params.altVideo.mp4;
                    } else if (params.altVideo.webm && supports_webm_video()) {
                        video.src = params.altVideo.webm;
                    } else {
                        return false;
                    }
                    video.play();
                    return true;
                }
            } else {
                return false;
            }
        }

        this.init = function(video, canvas, setupVideo) {
            if (setupVideo === undefined || setupVideo == true) {
                navigator.getUserMedia = navigator.getUserMedia ||
                    navigator.webkitGetUserMedia ||
                    navigator.mozGetUserMedia ||
                    navigator.msGetUserMedia;
                window.URL = window.URL || window.webkitURL || window.msURL || window.mozURL;
                // check for camerasupport
                if (navigator.getUserMedia) {
                    headtrackerStatus("getUserMedia");

                    var videoSelector = {
                        video: { optional: [{ minWidth: video.width }, { minHeight: video.height }] }
                    };

                    // chrome shim
                    if (window.navigator.appVersion.match(/Chrome\/(.*?) /)) {
                        var chromeVersion = parseInt(window.navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10);
                        if (chromeVersion < 20) {
                            videoSelector = "video";
                        }
                    };

                    // opera shim
                    if (window.opera) {
                        window.URL = window.URL || {};
                        if (!window.URL.createObjectURL) window.URL.createObjectURL = function(obj) { return obj; };
                    }

                    // set up stream
                    navigator.getUserMedia(videoSelector, (function(stream) {
                        headtrackerStatus("camera found");
                        this.stream = stream;
                        if (video.mozCaptureStream) {
                            video.mozSrcObject = stream;
                        } else {
                            video.srcObject = stream;
                        }
                        video.play();
                    }).bind(this), function() {
                        headtrackerStatus("no camera");
                        insertAltVideo(video);
                    });
                } else {
                    headtrackerStatus("no getUserMedia");
                    if (!insertAltVideo(video)) {
                        return false;
                    }
                }


            }

            videoElement = video;
            canvasElement = canvas;
            canvasContext = canvas.getContext("2d");

            // create ui if needed
            if (params.ui) {
                ui = new headtrackr.Ui();
            }

            // create smoother if enabled
            smoother = new headtrackr.Smoother(0.35, params.detectionInterval + 15);

            this.initialized = true;
        }

        var lastTrack = 0;
        var track = function() {
            // Copy video to canvas
            if (!run)
                return;
            canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            var time = new Date().getTime();
            if (time - lastTrack >= params.detectionInterval) {


                // if facetracking hasn't started, initialize facetrackr
                if (facetracker === undefined) {
                    facetracker =
                        new headtrackr.facetrackr.Tracker({ debug: params.debug, calcAngles: params.calcAngles });
                    facetracker.init(canvasElement);
                }

                // track face
                facetracker.track()
                var faceObj = facetracker.getTrackingObject({ debug: params.debug });

                if (faceObj.detection == "WB") headtrackerStatus("whitebalance");
                if (firstRun && faceObj.detection == "VJ") headtrackerStatus("detecting");

                // check if we have a detection first
                if (!(faceObj.confidence == 0)) {
                    if (faceObj.detection == "VJ") {
                        if (detectionTimer === undefined) {
                            // start timing
                            detectionTimer = (new Date).getTime();
                        }
                        if (((new Date).getTime() - detectionTimer) > 5000) {
                            headtrackerStatus("hints");
                        }

                        var x = (faceObj.x + faceObj.width / 2); //midpoint
                        var y = (faceObj.y + faceObj.height / 2); //midpoint

                        if (params.debug) {
                            // draw detected face on debuggercanvas
                            debugContext.strokeStyle = "#0000CC";
                            debugContext.strokeRect(faceObj.x, faceObj.y, faceObj.width, faceObj.height);
                        }
                    }
                    if (faceObj.detection == "CS") {
                        var x = faceObj.x; //midpoint
                        var y = faceObj.y; //midpoint

                        if (detectionTimer !== undefined) detectionTimer = undefined;

                        if (params.debug) {
                            // draw tracked face on debuggercanvas
                            debugContext.translate(faceObj.x, faceObj.y)
                            debugContext.rotate(faceObj.angle - (Math.PI / 2));
                            debugContext.strokeStyle = "#00CC00";
                            debugContext.strokeRect((-(faceObj.width / 2)) >> 0, (-(faceObj.height / 2)) >> 0,
                                faceObj.width, faceObj.height);
                            debugContext.rotate((Math.PI / 2) - faceObj.angle);
                            debugContext.translate(-faceObj.x, -faceObj.y);
                        }

                        // fade out video if it's showing
                        if (!videoFaded && params.fadeVideo) {
                            fadeVideo();
                            videoFaded = true;
                        }

                        this.status = 'tracking';

                        //check if we've lost tracking of face
                        if (faceObj.width == 0 || faceObj.height == 0) {
                            if (params.retryDetection) {
                                // retry facedetection
                                headtrackerStatus("redetecting");

                                facetracker = new headtrackr.facetrackr.Tracker({
                                    whitebalancing: false,
                                    debug: params.debug,
                                    calcAngles: params.calcAngles
                                });
                                facetracker.init(canvasElement);
                                faceFound = false;
                                headposition = undefined;

                                // show video again if it's not already showing
                                if (videoFaded) {
                                    videoElement.style.opacity = 1;
                                    videoFaded = false;
                                }
                            } else {
                                headtrackerStatus("lost");
                                this.stop();
                            }
                        } else {
                            if (!faceFound) {
                                headtrackerStatus("found");
                                faceFound = true;
                            }

                            if (params.smoothing) {
                                // smooth values
                                if (!smoother.initialized) {
                                    smoother.init(faceObj);
                                }
                                faceObj = smoother.smooth(faceObj);
                            }

                            // get headposition
                            if (headposition === undefined && params.headPosition) {
                                // wait until headdiagonal is stable before initializing headposition
                                var stable = false;

                                // calculate headdiagonal
                                var headdiag =
                                    Math.sqrt(faceObj.width * faceObj.width + faceObj.height * faceObj.height);

                                if (headDiagonal.length < 6) {
                                    headDiagonal.push(headdiag);
                                } else {
                                    headDiagonal.splice(0, 1);
                                    headDiagonal.push(headdiag);
                                    if ((Math.max.apply(null, headDiagonal) - Math.min.apply(null, headDiagonal)) < 5) {
                                        stable = true;
                                    }
                                }

                                if (stable) {
                                    if (firstRun) {
                                        if (params.fov === undefined) {
                                            headposition = new headtrackr.headposition.Tracker(faceObj,
                                                canvasElement.width,
                                                canvasElement.height,
                                                { distance_from_camera_to_screen: params.cameraOffset });
                                        } else {
                                            headposition = new headtrackr.headposition.Tracker(faceObj,
                                                canvasElement.width,
                                                canvasElement.height,
                                                {
                                                    fov: params.fov,
                                                    distance_from_camera_to_screen: params.cameraOffset
                                                });
                                        }
                                        fov = headposition.getFOV();
                                        firstRun = false;
                                    } else {
                                        headposition = new headtrackr.headposition.Tracker(faceObj, canvasElement.width,
                                            canvasElement.height,
                                            { fov: fov, distance_from_camera_to_screen: params.cameraOffset });
                                    }
                                    headposition.track(faceObj);
                                }
                            } else if (params.headPosition) {
                                headposition.track(faceObj);
                            }
                        }
                    }
                }
                lastTrack = time;
            } else {
                var evt = document.createEvent("Event");
                evt.initEvent("facetrackingEvent", true, true);
                evt.preview = true;
                document.dispatchEvent(evt);
            }
            if (run) {
                detector = window.setTimeout(track, 1000 / 60);
            }
        }.bind(this);

        var starter = function() {
            // does some safety checks before starting

            // sometimes canvasContext is not available yet, so try and catch if it's not there...
            try {
                canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

                // in some cases, the video sends events before starting to draw
                // so check that we have something on video before starting to track
                var canvasContent = headtrackr.getWhitebalance(canvasElement);
                if (canvasContent > 0) {
                    run = true;
                    track();
                } else {
                    window.setTimeout(starter, 100);
                }
            } catch (err) {
                window.setTimeout(starter, 100);
            }
        }

        this.start = function() {
            // check if initialized
            if (!this.initialized) return false;

            // check if video is playing, if not, return false
            if (!(videoElement.currentTime > 0 && !videoElement.paused && !videoElement.ended)) {

                run = true;
                //set event
                videoElement.addEventListener('playing', starter, false);

                return true;
            } else {
                starter();
            }

            return true;
        }

        this.stop = function() {
            window.clearTimeout(detector);
            run = false;
            headtrackerStatus("stopped");
            facetracker = undefined;
            faceFound = false;

            return true;
        }

        this.stopStream = function() {
            if (this.stream !== undefined) {
                // Support for pre-standardisation browsers
                if (this.stream.stop !== undefined) {
                    this.stream.stop();
                }
                // Standards-compliant (per-stream)
                else if (this.stream.getVideoTracks !== undefined) {
                    this.stream.getVideoTracks().forEach(function(t) { t.stop(); })
                }
            } else {
                console.warn("No streams to stop");
            }
        }

        this.getFOV = function() {
            return fov;
        }

        // fade out videoElement
        var fadeVideo = function() {
            if (videoElement.style.opacity == "") {
                videoElement.style.opacity = 0.98;
                window.setTimeout(fadeVideo, 50);
            } else if (videoElement.style.opacity > 0.30) {
                videoElement.style.opacity -= 0.02;
                window.setTimeout(fadeVideo, 50);
            } else {
                videoElement.style.opacity = 0.3;
            }
        }
    };

// bind shim
// from https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind

    if (!Function.prototype.bind) {
        Function.prototype.bind = function(oThis) {
            if (typeof this !== "function") {
                // closest thing possible to the ECMAScript 5 internal IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                fToBind = this,
                fNOP = function() {},
                fBound = function() {
                    return fToBind.apply(this instanceof fNOP
                        ? this
                        : oThis || window,
                        aArgs.concat(Array.prototype.slice.call(arguments)));
                };

            fNOP.prototype = this.prototype;
            fBound.prototype = new fNOP();

            return fBound;
        };
    }

// video support utility functions

    function supports_video() {
        return !!document.createElement('video').canPlayType;
    }

    function supports_h264_baseline_video() {
        if (!supports_video()) {
            return false;
        }
        var v = document.createElement("video");
        return v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
    }

    function supports_ogg_theora_video() {
        if (!supports_video()) {
            return false;
        }
        var v = document.createElement("video");
        return v.canPlayType('video/ogg; codecs="theora, vorbis"');
    }

    function supports_webm_video() {
        if (!supports_video()) {
            return false;
        }
        var v = document.createElement("video");
        return v.canPlayType('video/webm; codecs="vp8, vorbis"');
    }

/**
 * Viola-Jones-like face detection algorithm
 * Some explanation here: http://liuliu.me/eyes/javascript-face-detection-explained/
 *
 * @author Liu Liu / github.com/liuliu
 *
 * Copyright (c) 2010, Liu Liu
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * * Neither the name of the authors nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

    headtrackr.ccv = {};

    headtrackr.ccv.grayscale = function(canvas) {
        /* detect_objects requires gray-scale image */
        var ctx = canvas.getContext("2d");
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = imageData.data;
        var pix1, pix2, pix = canvas.width * canvas.height * 4;
        while (pix > 0)
            data[pix -= 4] = data[pix1 = pix + 1] = data[pix2 = pix + 2] =
                (data[pix] * 0.3 + data[pix1] * 0.59 + data[pix2] * 0.11);
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    };

    headtrackr.ccv.array_group = function(seq, gfunc) {
        var i, j;
        var node = new Array(seq.length);
        for (i = 0; i < seq.length; i++)
            node[i] = {
                "parent": -1,
                "element": seq[i],
                "rank": 0
            };
        for (i = 0; i < seq.length; i++) {
            if (!node[i].element)
                continue;
            var root = i;
            while (node[root].parent != -1)
                root = node[root].parent;
            for (j = 0; j < seq.length; j++) {
                if (i != j && node[j].element && gfunc(node[i].element, node[j].element)) {
                    var root2 = j;

                    while (node[root2].parent != -1)
                        root2 = node[root2].parent;

                    if (root2 != root) {
                        if (node[root].rank > node[root2].rank)
                            node[root2].parent = root;
                        else {
                            node[root].parent = root2;
                            if (node[root].rank == node[root2].rank)
                                node[root2].rank++;
                            root = root2;
                        }

                        /* compress path from node2 to the root: */
                        var temp, node2 = j;
                        while (node[node2].parent != -1) {
                            temp = node2;
                            node2 = node[node2].parent;
                            node[temp].parent = root;
                        }

                        /* compress path from node to the root: */
                        node2 = i;
                        while (node[node2].parent != -1) {
                            temp = node2;
                            node2 = node[node2].parent;
                            node[temp].parent = root;
                        }
                    }
                }
            }
        }
        var idx = new Array(seq.length);
        var class_idx = 0;
        for (i = 0; i < seq.length; i++) {
            j = -1;
            var node1 = i;
            if (node[node1].element) {
                while (node[node1].parent != -1)
                    node1 = node[node1].parent;
                if (node[node1].rank >= 0)
                    node[node1].rank = ~class_idx++;
                j = ~node[node1].rank;
            }
            idx[i] = j;
        }
        return { "index": idx, "cat": class_idx };
    };

    headtrackr.ccv.detect_objects = function(canvas, cascade, interval, min_neighbors) {
        var scale = Math.pow(2, 1 / (interval + 1));
        var next = interval + 1;
        var scale_upto = Math.floor(Math.log(Math.min(cascade.width, cascade.height)) / Math.log(scale));
        var pyr = new Array((scale_upto + next * 2) * 4);
        pyr[0] = canvas;
        pyr[0].data = pyr[0].getContext("2d").getImageData(0, 0, pyr[0].width, pyr[0].height).data;
        var i, j, k, x, y, q;
        for (i = 1; i <= interval; i++) {
            pyr[i * 4] = document.createElement("canvas");
            pyr[i * 4].width = Math.floor(pyr[0].width / Math.pow(scale, i));
            pyr[i * 4].height = Math.floor(pyr[0].height / Math.pow(scale, i));
            pyr[i * 4].getContext("2d").drawImage(pyr[0], 0, 0, pyr[0].width, pyr[0].height, 0, 0, pyr[i * 4].width,
                pyr[i * 4].height);
            pyr[i * 4].data = pyr[i * 4].getContext("2d").getImageData(0, 0, pyr[i * 4].width, pyr[i * 4].height).data;
        }
        for (i = next; i < scale_upto + next * 2; i++) {
            pyr[i * 4] = document.createElement("canvas");
            pyr[i * 4].width = Math.floor(pyr[i * 4 - next * 4].width / 2);
            pyr[i * 4].height = Math.floor(pyr[i * 4 - next * 4].height / 2);
            pyr[i * 4].getContext("2d").drawImage(pyr[i * 4 - next * 4], 0, 0, pyr[i * 4 - next * 4].width,
                pyr[i * 4 - next * 4].height, 0, 0, pyr[i * 4].width, pyr[i * 4].height);
            pyr[i * 4].data = pyr[i * 4].getContext("2d").getImageData(0, 0, pyr[i * 4].width, pyr[i * 4].height).data;
        }
        for (i = next * 2; i < scale_upto + next * 2; i++) {
            pyr[i * 4 + 1] = document.createElement("canvas");
            pyr[i * 4 + 1].width = Math.floor(pyr[i * 4 - next * 4].width / 2);
            pyr[i * 4 + 1].height = Math.floor(pyr[i * 4 - next * 4].height / 2);
            pyr[i * 4 + 1].getContext("2d").drawImage(pyr[i * 4 - next * 4], 1, 0, pyr[i * 4 - next * 4].width - 1,
                pyr[i * 4 - next * 4].height, 0, 0, pyr[i * 4 + 1].width - 2, pyr[i * 4 + 1].height);
            pyr[i * 4 + 1].data = pyr[i * 4 + 1].getContext("2d")
                .getImageData(0, 0, pyr[i * 4 + 1].width, pyr[i * 4 + 1].height).data;
            pyr[i * 4 + 2] = document.createElement("canvas");
            pyr[i * 4 + 2].width = Math.floor(pyr[i * 4 - next * 4].width / 2);
            pyr[i * 4 + 2].height = Math.floor(pyr[i * 4 - next * 4].height / 2);
            pyr[i * 4 + 2].getContext("2d").drawImage(pyr[i * 4 - next * 4], 0, 1, pyr[i * 4 - next * 4].width,
                pyr[i * 4 - next * 4].height - 1, 0, 0, pyr[i * 4 + 2].width, pyr[i * 4 + 2].height - 2);
            pyr[i * 4 + 2].data = pyr[i * 4 + 2].getContext("2d")
                .getImageData(0, 0, pyr[i * 4 + 2].width, pyr[i * 4 + 2].height).data;
            pyr[i * 4 + 3] = document.createElement("canvas");
            pyr[i * 4 + 3].width = Math.floor(pyr[i * 4 - next * 4].width / 2);
            pyr[i * 4 + 3].height = Math.floor(pyr[i * 4 - next * 4].height / 2);
            pyr[i * 4 + 3].getContext("2d").drawImage(pyr[i * 4 - next * 4], 1, 1, pyr[i * 4 - next * 4].width - 1,
                pyr[i * 4 - next * 4].height - 1, 0, 0, pyr[i * 4 + 3].width - 2, pyr[i * 4 + 3].height - 2);
            pyr[i * 4 + 3].data = pyr[i * 4 + 3].getContext("2d")
                .getImageData(0, 0, pyr[i * 4 + 3].width, pyr[i * 4 + 3].height).data;
        }
        for (j = 0; j < cascade.stage_classifier.length; j++)
            cascade.stage_classifier[j].orig_feature = cascade.stage_classifier[j].feature;
        var scale_x = 1, scale_y = 1;
        var dx = [0, 1, 0, 1];
        var dy = [0, 0, 1, 1];
        var seq = [];
        for (i = 0; i < scale_upto; i++) {
            var qw = pyr[i * 4 + next * 8].width - Math.floor(cascade.width / 4);
            var qh = pyr[i * 4 + next * 8].height - Math.floor(cascade.height / 4);
            var step = [pyr[i * 4].width * 4, pyr[i * 4 + next * 4].width * 4, pyr[i * 4 + next * 8].width * 4];
            var paddings = [
                pyr[i * 4].width * 16 - qw * 16,
                pyr[i * 4 + next * 4].width * 8 - qw * 8,
                pyr[i * 4 + next * 8].width * 4 - qw * 4
            ];
            for (j = 0; j < cascade.stage_classifier.length; j++) {
                var orig_feature = cascade.stage_classifier[j].orig_feature;
                var feature = cascade.stage_classifier[j].feature = new Array(cascade.stage_classifier[j].count);
                for (k = 0; k < cascade.stage_classifier[j].count; k++) {
                    feature[k] = {
                        "size": orig_feature[k].size,
                        "px": new Array(orig_feature[k].size),
                        "pz": new Array(orig_feature[k].size),
                        "nx": new Array(orig_feature[k].size),
                        "nz": new Array(orig_feature[k].size)
                    };
                    for (q = 0; q < orig_feature[k].size; q++) {
                        feature[k].px[q] = orig_feature[k].px[q] * 4 +
                            orig_feature[k].py[q] * step[orig_feature[k].pz[q]];
                        feature[k].pz[q] = orig_feature[k].pz[q];
                        feature[k].nx[q] = orig_feature[k].nx[q] * 4 +
                            orig_feature[k].ny[q] * step[orig_feature[k].nz[q]];
                        feature[k].nz[q] = orig_feature[k].nz[q];
                    }
                }
            }
            for (q = 0; q < 4; q++) {
                var u8 = [pyr[i * 4].data, pyr[i * 4 + next * 4].data, pyr[i * 4 + next * 8 + q].data];
                var u8o = [
                    dx[q] * 8 + dy[q] * pyr[i * 4].width * 8, dx[q] * 4 + dy[q] * pyr[i * 4 + next * 4].width * 4, 0
                ];
                for (y = 0; y < qh; y++) {
                    for (x = 0; x < qw; x++) {
                        var sum = 0;
                        var flag = true;
                        for (j = 0; j < cascade.stage_classifier.length; j++) {
                            sum = 0;
                            var alpha = cascade.stage_classifier[j].alpha;
                            var feature = cascade.stage_classifier[j].feature;
                            for (k = 0; k < cascade.stage_classifier[j].count; k++) {
                                var feature_k = feature[k];
                                var p, pmin = u8[feature_k.pz[0]][u8o[feature_k.pz[0]] + feature_k.px[0]];
                                var n, nmax = u8[feature_k.nz[0]][u8o[feature_k.nz[0]] + feature_k.nx[0]];
                                if (pmin <= nmax) {
                                    sum += alpha[k * 2];
                                } else {
                                    var f, shortcut = true;
                                    for (f = 0; f < feature_k.size; f++) {
                                        if (feature_k.pz[f] >= 0) {
                                            p = u8[feature_k.pz[f]][u8o[feature_k.pz[f]] + feature_k.px[f]];
                                            if (p < pmin) {
                                                if (p <= nmax) {
                                                    shortcut = false;
                                                    break;
                                                }
                                                pmin = p;
                                            }
                                        }
                                        if (feature_k.nz[f] >= 0) {
                                            n = u8[feature_k.nz[f]][u8o[feature_k.nz[f]] + feature_k.nx[f]];
                                            if (n > nmax) {
                                                if (pmin <= n) {
                                                    shortcut = false;
                                                    break;
                                                }
                                                nmax = n;
                                            }
                                        }
                                    }
                                    sum += (shortcut) ? alpha[k * 2 + 1] : alpha[k * 2];
                                }
                            }
                            if (sum < cascade.stage_classifier[j].threshold) {
                                flag = false;
                                break;
                            }
                        }
                        if (flag) {
                            seq.push({
                                "x": (x * 4 + dx[q] * 2) * scale_x,
                                "y": (y * 4 + dy[q] * 2) * scale_y,
                                "width": cascade.width * scale_x,
                                "height": cascade.height * scale_y,
                                "neighbor": 1,
                                "confidence": sum
                            });
                        }
                        u8o[0] += 16;
                        u8o[1] += 8;
                        u8o[2] += 4;
                    }
                    u8o[0] += paddings[0];
                    u8o[1] += paddings[1];
                    u8o[2] += paddings[2];
                }
            }
            scale_x *= scale;
            scale_y *= scale;
        }
        for (j = 0; j < cascade.stage_classifier.length; j++)
            cascade.stage_classifier[j].feature = cascade.stage_classifier[j].orig_feature;
        if (!(min_neighbors > 0))
            return seq;
        else {
            var result = headtrackr.ccv.array_group(seq, function(r1, r2) {
                var distance = Math.floor(r1.width * 0.25 + 0.5);

                return r2.x <= r1.x + distance &&
                    r2.x >= r1.x - distance &&
                    r2.y <= r1.y + distance &&
                    r2.y >= r1.y - distance &&
                    r2.width <= Math.floor(r1.width * 1.5 + 0.5) &&
                    Math.floor(r2.width * 1.5 + 0.5) >= r1.width;
            });
            var ncomp = result.cat;
            var idx_seq = result.index;
            var comps = new Array(ncomp + 1);
            for (i = 0; i < comps.length; i++)
                comps[i] = {
                    "neighbors": 0,
                    "x": 0,
                    "y": 0,
                    "width": 0,
                    "height": 0,
                    "confidence": 0
                };

            // count number of neighbors
            for (i = 0; i < seq.length; i++) {
                var r1 = seq[i];
                var idx = idx_seq[i];

                if (comps[idx].neighbors == 0)
                    comps[idx].confidence = r1.confidence;

                ++comps[idx].neighbors;

                comps[idx].x += r1.x;
                comps[idx].y += r1.y;
                comps[idx].width += r1.width;
                comps[idx].height += r1.height;
                comps[idx].confidence = Math.max(comps[idx].confidence, r1.confidence);
            }

            var seq2 = [];
            // calculate average bounding box
            for (i = 0; i < ncomp; i++) {
                var n = comps[i].neighbors;
                if (n >= min_neighbors)
                    seq2.push({
                        "x": (comps[i].x * 2 + n) / (2 * n),
                        "y": (comps[i].y * 2 + n) / (2 * n),
                        "width": (comps[i].width * 2 + n) / (2 * n),
                        "height": (comps[i].height * 2 + n) / (2 * n),
                        "neighbors": comps[i].neighbors,
                        "confidence": comps[i].confidence
                    });
            }

            var result_seq = [];
            // filter out small face rectangles inside large face rectangles
            for (i = 0; i < seq2.length; i++) {
                var r1 = seq2[i];
                var flag = true;
                for (j = 0; j < seq2.length; j++) {
                    var r2 = seq2[j];
                    var distance = Math.floor(r2.width * 0.25 + 0.5);

                    if (i != j &&
                        r1.x >= r2.x - distance &&
                        r1.y >= r2.y - distance &&
                        r1.x + r1.width <= r2.x + r2.width + distance &&
                        r1.y + r1.height <= r2.y + r2.height + distance &&
                        (r2.neighbors > Math.max(3, r1.neighbors) || r1.neighbors < 3)) {
                        flag = false;
                        break;
                    }
                }

                if (flag)
                    result_seq.push(r1);
            }
            return result_seq;
        }
    };

    headtrackr.cascade = headtrackr_cascade;

/**
 * @author auduno / github.com/auduno
 */

    headtrackr.getWhitebalance = function(canvas) {

        // returns average gray value in canvas

        var avggray, avgr, avgb, avgg;

        var canvasContext = canvas.getContext('2d');
        var image = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
        var id = image.data;
        var imagesize = image.width * image.height;
        var r = g = b = 0;

        for (var i = 0; i < imagesize; i++) {
            r += id[4 * i];
            g += id[(4 * i) + 1];
            b += id[(4 * i) + 2];
        }

        avgr = r / imagesize;
        avgg = g / imagesize;
        avgb = b / imagesize;
        avggray = (avgr + avgg + avgb) / 3;

        return avggray;

    }
/**
 * Smoother for smoothing tracked positions of face
 *
 * Double Exponential Smoothing-based Prediction
 *	 see: http://www.cs.brown.edu/people/jjl/pubs/kfvsexp_final_laviola.pdf
 *	 "Double Exponential Smoothing: An alternative to Kalman Filter-based Predictive Tracking"
 *
 * @author auduno / github.com/auduno
 * @param {number} a Smoothing parameter, between 0 and 1. 0 is max smoothing, 1 no smoothing.
 * @param {number} interval The ms interval between tracking events
 * @constructor
 */
    headtrackr.Smoother = function(alpha, interval) {

        // alpha = 0.35 smoothes ok while not introducing too much lag

        var sp, sp2, sl, newPositions, positions;
        var updateTime = new Date();

        this.initialized = false;

        // whether to use linear interpolation for times in intervals
        this.interpolate = false;

        this.init = function(initPos) {
            this.initialized = true;
            sp = [initPos.x, initPos.y, initPos.z, initPos.width, initPos.height];
            sp2 = sp;
            sl = sp.length;
        }

        this.smooth = function(pos) {

            positions = [pos.x, pos.y, pos.z, pos.width, pos.height];

            if (this.initialized) {
                // update
                for (var i = 0; i < sl; i++) {
                    sp[i] = alpha * positions[i] + (1 - alpha) * sp[i];
                    sp2[i] = alpha * sp[i] + (1 - alpha) * sp2[i];
                }

                // set time
                updateTime = new Date();

                var msDiff = (new Date()) - updateTime;
                var newPositions = predict(msDiff);

                pos.x = newPositions[0];
                pos.y = newPositions[1];
                pos.z = newPositions[2];
                pos.width = newPositions[3];
                pos.height = newPositions[4];

                return pos;
            } else {
                return false;
            }
        }

        function predict(time) {

            var retPos = [];

            if (this.interpolate) {
                var step = time / interval;
                var stepLo = step >> 0;
                var ratio = alpha / (1 - alpha);

                var a = (step - stepLo) * ratio;
                var b = (2 + stepLo * ratio);
                var c = (1 + stepLo * ratio);

                for (var i = 0; i < sl; i++) {
                    retPos[i] = a * (sp[i] - sp2[i]) + b * sp[i] - c * sp2[i];
                }
            } else {
                var step = time / interval >> 0;
                var ratio = (alpha * step) / (1 - alpha);
                var a = 2 + ratio;
                var b = 1 + ratio;
                for (var i = 0; i < sl; i++) {
                    retPos[i] = a * sp[i] - b * sp2[i];
                }
            }

            return retPos;
        }
    }
/**
 * camshift object tracker
 *
 * ported with some optimizations from actionscript3 library FaceIt:
 *	 http://www.mukimuki.fr/flashblog/2009/06/18/camshift-going-to-the-source/
 *	 http://www.libspark.org/browser/as3/FaceIt
 * some explanation of algorithm here : 
 *	 http://www.cognotics.com/opencv/servo_2007_series/part_3/sidebar.html
 *
 * usage:
 *	 // create a new tracker
 *	 var cstracker = new headtrackr.camshift.Tracker();
 *	 // initialize it with a canvas, and a rectangle around the object on the canvas we'd like to track
 *	 cstracker.initTracker(some_canvas, new headtrackr.camshift.Rectangle(x,y,w,h));
 *	 // find object in same or some other canvas
 *	 cstracker.track(some_canvas);
 *	 // get position of found object
 *	 var currentPos = cstracker.getTrackObj();
 *	 currentPos.x // x-coordinate of center of object on canvas 
 *	 currentPos.y // y-coordinate of center of object on canvas 
 *	 currentPos.width // width of object
 *	 currentPos.height // heigh of object
 *	 currentPos.angle // angle of object in radians
 *
 * @author Benjamin Jung / jungbenj@gmail.com
 * @author auduno / github.com/auduno
 *
 * License of original actionscript code:
 *
 * Copyright (C)2009 Benjamin Jung
 * 
 * Licensed under the MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

    headtrackr.camshift = {};

/**
 * RGB histogram
 *
 * @constructor
 */
    headtrackr.camshift.Histogram = function(imgdata) {

        this.size = 4096;

        var bins = [];
        var i, x, r, g, b, il;

        //initialize bins
        for (i = 0; i < this.size; i++) {
            bins.push(0);
        }

        //add histogram data
        for (x = 0, il = imgdata.length; x < il; x += 4) {
            r = imgdata[x + 0] >> 4; // round down to bins of 16
            g = imgdata[x + 1] >> 4;
            b = imgdata[x + 2] >> 4;
            bins[256 * r + 16 * g + b] += 1;
        }

        this.getBin = function(index) {
            return bins[index];
        }
    };

/**
 * moments object
 *
 * @constructor
 */
    headtrackr.camshift.Moments = function(data, x, y, w, h, second) {

        this.m00 = 0;
        this.m01 = 0;
        this.m10 = 0;
        this.m11 = 0;
        this.m02 = 0;
        this.m20 = 0;

        var i, j, val, vx, vy;
        var a = [];
        for (i = x; i < w; i++) {
            a = data[i];
            vx = i - x;

            for (j = y; j < h; j++) {
                val = a[j];

                vy = j - y;
                this.m00 += val;
                this.m01 += vy * val;
                this.m10 += vx * val;
                if (second) {
                    this.m11 += vx * vy * val;
                    this.m02 += vy * vy * val;
                    this.m20 += vx * vx * val;
                }
            }
        }

        this.invM00 = 1 / this.m00;
        this.xc = this.m10 * this.invM00;
        this.yc = this.m01 * this.invM00;
        this.mu00 = this.m00;
        this.mu01 = 0;
        this.mu10 = 0;
        if (second) {
            this.mu20 = this.m20 - this.m10 * this.xc;
            this.mu02 = this.m02 - this.m01 * this.yc;
            this.mu11 = this.m11 - this.m01 * this.xc;
        }
    };

/**
 * rectangle object
 *
 * @constructor
 */
    headtrackr.camshift.Rectangle = function(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;

        this.clone = function() {
            var c = new headtrackr.camshift.Rectangle();
            c.height = this.height;
            c.width = this.width;
            c.x = this.x;
            c.y = this.y;
            return c;
        }
    };

/**
 * Tracker object
 *
 * @constructor
 */
    headtrackr.camshift.Tracker = function(params) {

        if (params === undefined) params = {};
        if (params.calcAngles === undefined) params.calcAngles = true;

        var _modelHist,
            _curHist, //current histogram
            _pdf, // pixel probability data for current searchwindow
            _searchWindow, // rectangle where we are searching
            _trackObj, // object holding data about where current tracked object is
            _canvasCtx, // canvas context for initial canvas
            _canvasw, // canvas width for tracking canvas
            _canvash; // canvas height for tracking canvas

        this.getSearchWindow = function() {
            // return the search window used by the camshift algorithm in the current analysed image
            return _searchWindow.clone();
        }

        this.getTrackObj = function() {
            // return a trackobj with the size and orientation of the tracked object in the current analysed image
            return _trackObj.clone();
        }

        this.getPdf = function() {
            // returns a nested array representing color
            return _pdf;
        }

        this.getBackProjectionImg = function() {
            // return imgData representing pixel color probabilities, which can then be put into canvas
            var weights = _pdf;
            var w = _canvasw;
            var h = _canvash;
            var img = _canvasCtx.createImageData(w, h);
            var imgData = img.data;
            var x, y, val;
            for (x = 0; x < w; x++) {
                for (y = 0; y < h; y++) {
                    val = Math.floor(255 * weights[x][y]);
                    pos = ((y * w) + x) * 4;
                    imgData[pos] = val;
                    imgData[pos + 1] = val;
                    imgData[pos + 2] = val;
                    imgData[pos + 3] = 255;
                }
            }
            return img;
        }

        this.initTracker = function(canvas, trackedArea) {
            // initialize the tracker with canvas and the area of interest as a rectangle

            _canvasCtx = canvas.getContext("2d");
            var taw = trackedArea.width;
            var tah = trackedArea.height;
            var tax = trackedArea.x;
            var tay = trackedArea.y;
            var trackedImg = _canvasCtx.getImageData(tax, tay, taw, tah);

            _modelHist = new headtrackr.camshift.Histogram(trackedImg.data);
            _searchWindow = trackedArea.clone();
            _trackObj = new headtrackr.camshift.TrackObj();
        }

        this.track = function(canvas) {
            // search the tracked object by camshift
            var canvasCtx = canvas.getContext("2d");
            _canvash = canvas.height;
            _canvasw = canvas.width;
            var imgData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
            if (imgData.width != 0 && imgData.height != 0) camShift(imgData);
        }

        function camShift(frame) {

            var w = frame.width;
            var h = frame.height;

            // search location
            var m = meanShift(frame);

            var a = m.mu20 * m.invM00;
            var c = m.mu02 * m.invM00;

            if (params.calcAngles) {
                // use moments to find size and orientation
                var b = m.mu11 * m.invM00;
                var d = a + c;
                var e = Math.sqrt((4 * b * b) + ((a - c) * (a - c)));

                // update object position
                _trackObj.width = Math.sqrt((d - e) * 0.5) << 2;
                _trackObj.height = Math.sqrt((d + e) * 0.5) << 2;
                _trackObj.angle = Math.atan2(2 * b, a - c + e);

                // to have a positive counter clockwise angle
                if (_trackObj.angle < 0) _trackObj.angle = _trackObj.angle + Math.PI;
            } else {
                _trackObj.width = Math.sqrt(a) << 2;
                _trackObj.height = Math.sqrt(c) << 2;
                _trackObj.angle = Math.PI / 2;
            }

            // check if tracked object is into the limit
            _trackObj.x = Math.floor(Math.max(0, Math.min(_searchWindow.x + _searchWindow.width / 2, w)));
            _trackObj.y = Math.floor(Math.max(0, Math.min(_searchWindow.y + _searchWindow.height / 2, h)));

            // new search window size
            _searchWindow.width = Math.floor(1.1 * _trackObj.width);
            _searchWindow.height = Math.floor(1.1 * _trackObj.height);
        }

        function meanShift(frame) {
            // mean-shift algorithm on frame

            var w = frame.width;
            var h = frame.height;
            var imgData = frame.data;

            var curHist = new headtrackr.camshift.Histogram(imgData);

            var weights = getWeights(_modelHist, curHist);

            // Color probabilities distributions
            _pdf = getBackProjectionData(imgData, frame.width, frame.height, weights);

            var m, x, y, i, wadx, wady, wadw, wadh;

            var meanShiftIterations = 10; // maximum number of iterations

            // store initial searchwindow
            var prevx = _searchWindow.x;
            var prevy = _searchWindow.y;

            // Locate by iteration the maximum of density into the probability distributions
            for (i = 0; i < meanShiftIterations; i++) {
                // get searchwindow from _pdf:
                wadx = Math.max(_searchWindow.x, 0);
                wady = Math.max(_searchWindow.y, 0);
                wadw = Math.min(wadx + _searchWindow.width, w);
                wadh = Math.min(wady + _searchWindow.height, h);

                m = new headtrackr.camshift.Moments(_pdf, wadx, wady, wadw, wadh, (i == meanShiftIterations - 1));
                x = m.xc;
                y = m.yc;

                _searchWindow.x += ((x - _searchWindow.width / 2) >> 0);
                _searchWindow.y += ((y - _searchWindow.height / 2) >> 0);

                // if we have reached maximum density, get second moments and stop iterations
                if (_searchWindow.x == prevx && _searchWindow.y == prevy) {
                    m = new headtrackr.camshift.Moments(_pdf, wadx, wady, wadw, wadh, true);
                    break;
                } else {
                    prevx = _searchWindow.x;
                    prevy = _searchWindow.y;
                }
            }

            _searchWindow.x = Math.max(0, Math.min(_searchWindow.x, w));
            _searchWindow.y = Math.max(0, Math.min(_searchWindow.y, h));

            return m;
        }

        function getWeights(mh, ch) {
            // Return an array of the probabilities of each histogram color bins
            var weights = [];
            var p;

            // iterate over the entire histogram and compare
            for (var i = 0; i < 4096; i++) {
                if (ch.getBin(i) != 0) {
                    p = Math.min(mh.getBin(i) / ch.getBin(i), 1);
                } else {
                    p = 0;
                }
                weights.push(p);
            }

            return weights;
        }

        function getBackProjectionData(imgData, idw, idh, weights, hsMap) {
            // Return a matrix representing pixel color probabilities
            var data = [];
            var x, y, r, g, b, pos;
            var a = [];

            // TODO : we could use typed arrays here
            // but we should then do a compatibilitycheck

            for (x = 0; x < idw; x++) {
                a = [];
                for (y = 0; y < idh; y++) {
                    pos = ((y * idw) + x) * 4;
                    r = imgData[pos] >> 4;
                    g = imgData[pos + 1] >> 4;
                    b = imgData[pos + 2] >> 4;
                    a.push(weights[256 * r + 16 * g + b]);
                }
                data[x] = a;
            }
            return data;
        }
    };

/**
 * Object returned by tracker
 *  note that x,y is the point of the center of the tracker
 *
 * @constructor
 */
    headtrackr.camshift.TrackObj = function() {
        this.height = 0;
        this.width = 0;
        this.angle = 0;
        this.x = 0;
        this.y = 0;

        this.clone = function() {
            var c = new headtrackr.camshift.TrackObj();
            c.height = this.height;
            c.width = this.width;
            c.angle = this.angle;
            c.x = this.x;
            c.y = this.y;
            return c;
        }
    };
/**
 * Library for detecting and tracking the position of a face in a canvas object
 *
 * usage:
 *	 // create a new tracker
 *	 var ft = new headtrackr.facetrackr.Tracker();
 *	 // initialize it with a canvas
 *	 ft.init(some_canvas);
 *	 // track in canvas
 *	 ft.track();
 *	 // get position of found object
 *	 var currentPos = ft.getTrackObj();
 *	 currentPos.x // x-coordinate of center of object on canvas 
 *	 currentPos.y // y-coordinate of center of object on canvas 
 *	 currentPos.width // width of object
 *	 currentPos.height // height of object
 *	 currentPos.angle // angle of object in radians
 *	 currentPos.confidence // returns confidence (doesn't work for CS yet)
 *	 currentPos.detection // current detectionmethod (VJ or CS)
 *	 currentPos.time // time spent
 * 
 * @author auduno / github.com/auduno
 */

    

    headtrackr.facetrackr = {};

/**
 * optional parameters to params:
 *	 smoothing : whether to use smoothing on output (default is true)
 *	 smoothingInterval : should be the same as detectionInterval plus time of tracking (default is 35 ms)
 *	 sendEvents : whether to send events (default is true)
 *	 whitebalancing : whether to wait for camera whitebalancing before starting detection (default is true)
 *   calcAnglss : whether to calculate orientation of tracked object (default for facetrackr is false)
 *
 * @constructor
 */
    headtrackr.facetrackr.Tracker = function(params) {

        if (!params) params = {};

        if (params.sendEvents === undefined) params.sendEvents = true;
        if (params.whitebalancing === undefined) params.whitebalancing = true;
        if (params.debug === undefined) {
            params.debug = false;
        } else {
            if (params.debug.tagName != 'CANVAS') params.debug = false;
        }
        if (params.whitebalancing) {
            var _currentDetection = "WB";
        } else {
            var _currentDetection = "VJ";
        }
        if (params.calcAngles == undefined) params.calcAngles = false;

        var _inputcanvas, _curtracked, _cstracker;

        var _confidenceThreshold = -10; // needed confidence before switching to Camshift
        var previousWhitebalances = []; // array of previous 10 whitebalance values
        var pwbLength = 15;

        this.init = function(inputcanvas) {
            _inputcanvas = inputcanvas
            // initialize cs tracker
            _cstracker = new headtrackr.camshift.Tracker({ calcAngles: params.calcAngles });
        }

        this.track = function() {
            var result;
            // do detection
            if (_currentDetection == "WB") {
                result = checkWhitebalance(_inputcanvas);
            } else if (_currentDetection == "VJ") {
                result =doVJDetection(_inputcanvas);
            } else if (_currentDetection == "CS") {
                result = doCSDetection(_inputcanvas);
            }

            // check whether whitebalance is stable before starting detection
            if (result.detection == "WB") {
                if (previousWhitebalances.length >= pwbLength) previousWhitebalances.pop();
                previousWhitebalances.unshift(result.wb);
                if (previousWhitebalances.length == pwbLength) {
                    //get max
                    var max = Math.max.apply(null, previousWhitebalances);
                    //get min
                    var min = Math.min.apply(null, previousWhitebalances);

                    // if difference between the last ten whitebalances is less than 2,
                    //   we assume whitebalance is stable
                    if ((max - min) < 2) {
                        // switch to facedetection
                        _currentDetection = "VJ";
                    }
                }
            }
            // check if Viola-Jones has found a viable face
            if (result.detection == "VJ" && result.confidence > _confidenceThreshold) {
                // switch to Camshift
                _currentDetection = "CS";
                // when switching, we initalize camshift with current found face
                var cRectangle = new headtrackr.camshift.Rectangle(
                    Math.floor(result.x),
                    Math.floor(result.y),
                    Math.floor(result.width),
                    Math.floor(result.height)
                );
                _cstracker.initTracker(_inputcanvas, cRectangle);
            }

            _curtracked = result;

            if (params.sendEvents) {
                // send events
                var evt = document.createEvent("Event");
                evt.initEvent("facetrackingEvent", true, true);
                evt.height = result.height;
                evt.width = result.width;
                evt.angle = result.angle;
                evt.x = result.x;
                evt.y = result.y;
                evt.confidence = result.confidence;
                evt.detection = result.detection;
                evt.time = result.time;
                document.dispatchEvent(evt);
            }
        }

        this.getTrackingObject = function() {
            return _curtracked.clone();
        }

        // Viola-Jones detection
        function doVJDetection(canvas) {
            // start timing
            var start = (new Date).getTime();

            // we seem to have to copy canvas to avoid interference with camshift
            // not entirely sure why
            // TODO: ways to avoid having to copy canvas every time

            var w = canvas.width;
            var h = canvas.height;
            var rX = 400 / w; // reduction in width
            var rY = 400 / h;

            var ccvCanvas = document.createElement('canvas');
            ccvCanvas.width = w * rX;
            ccvCanvas.height = h * rY;
            ccvCanvas.getContext("2d").drawImage(
                canvas, 0, 0, w, h, 0, 0, ccvCanvas.width, ccvCanvas.height
            );

            var comp = headtrackr.ccv.detect_objects(
                headtrackr.ccv.grayscale(ccvCanvas), headtrackr.cascade, 5, 1
            );

            // end timing
            var diff = (new Date).getTime() - start;

            // loop through found faces and pick the most likely one
            // TODO: check amount of neighbors and size as well?
            // TODO: choose the face that is most in the center of canvas?
            var candidate;
            if (comp.length > 0) {
                candidate = comp[0];
            }
            for (var i = 1; i < comp.length; i++) {
                if (comp[i].confidence > candidate.confidence) {
                    candidate = comp[i];
                }
            }

            // copy information from ccv object to a new trackObj
            var result = new headtrackr.facetrackr.TrackObj();
            if (!(candidate === undefined)) {
                result.width = candidate.width / rX;
                result.height = candidate.height / rY;
                result.x = candidate.x / rX;
                result.y = candidate.y / rY;
                result.confidence = candidate.confidence;
            }

            // copy timing to object
            result.time = diff;
            result.detection = "VJ";

            return result;
        }

        // Camshift detection
        function doCSDetection(canvas) {

            // start timing
            var start = (new Date).getTime();

            // detect
            _cstracker.track(canvas);
            var csresult = _cstracker.getTrackObj();

            // if debugging, draw backprojection image on debuggingcanvas
            if (params.debug) {
                params.debug.getContext('2d').putImageData(_cstracker.getBackProjectionImg(), 0, 0);
            }

            // end timing
            var diff = (new Date).getTime() - start;

            // copy information from CS object to a new trackObj
            var result = new headtrackr.facetrackr.TrackObj();
            result.width = csresult.width;
            result.height = csresult.height;
            result.x = csresult.x;
            result.y = csresult.y;
            // TODO: should we adjust this angle to be "clockwise"?
            result.angle = csresult.angle;
            // TODO: camshift should pass along some sort of confidence?
            result.confidence = 1;

            // copy timing to object
            result.time = diff;
            result.detection = "CS";

            return result;
        }

        // Whitebalancing
        function checkWhitebalance(canvas) {
            var result = new headtrackr.facetrackr.TrackObj();
            // get whitebalance value
            result.wb = headtrackr.getWhitebalance(canvas);
            result.detection = "WB";

            return result
        }
    };

/**
 * @constructor
 */
    headtrackr.facetrackr.TrackObj = function() {
        this.height = 0;
        this.width = 0;
        this.angle = 0;
        this.x = 0;
        this.y = 0;
        this.confidence = -10000;
        this.detection = '';
        this.time = 0;

        this.clone = function() {
            var c = new headtrackr.facetrackr.TrackObj();
            c.height = this.height;
            c.width = this.width;
            c.angle = this.angle;
            c.x = this.x;
            c.y = this.y;
            c.confidence = this.confidence;
            c.detection = this.detection;
            c.time = this.time;
            return c;
        }
    };

/**
 * @author auduno / github.com/auduno
 * @constructor
 */

    headtrackr.Ui = function() {

        var timeout;

        // create element and attach to body
        var d = document.createElement('div'),
            d2 = document.createElement('div'),
            p = document.createElement('p');
        d.setAttribute('id', 'headtrackerMessageDiv');

        d.style.left = "20%";
        d.style.right = "20%";
        d.style.top = "30%";
        d.style.fontSize = "90px";
        d.style.color = "#777";
        d.style.position = "absolute";
        d.style.fontFamily = "Helvetica, Arial, sans-serif";
        d.style.zIndex = '100002';

        d2.style.marginLeft = "auto";
        d2.style.marginRight = "auto";
        d2.style.width = "100%";
        d2.style.textAlign = "center";
        d2.style.color = "#fff";
        d2.style.backgroundColor = "#444";
        d2.style.opacity = "0.5";

        p.setAttribute('id', 'headtrackerMessage');
        d2.appendChild(p);
        d.appendChild(d2);
        document.body.appendChild(d);

        var supportMessages = {
            "no getUserMedia": "getUserMedia is not supported in your browser :(",
            "no camera": "no camera found :("
        };

        var statusMessages = {
            "whitebalance": "Waiting for camera whitebalancing",
            "detecting": "Please wait while camera is detecting your face...",
            "hints":
                "We seem to have some problems detecting your face. Please make sure that your face is well and evenly lighted, and that your camera is working.",
            "redetecting": "Lost track of face, trying to detect again..",
            "lost": "Lost track of face :(",
            "found": "Face found! Move your head!"
        };

        var override = false;

        // function to call messages (and to fade them out after a time)
        document.addEventListener("headtrackrStatus", function(event) {
            if (event.status in statusMessages) {
                window.clearTimeout(timeout);
                if (!override) {
                    var messagep = document.getElementById('headtrackerMessage');
                    messagep.innerHTML = statusMessages[event.status];
                    timeout = window.setTimeout(function() { messagep.innerHTML = ''; }, 3000);
                }
            } else if (event.status in supportMessages) {
                override = true;
                window.clearTimeout(timeout);
                var messagep = document.getElementById('headtrackerMessage');
                messagep.innerHTML = supportMessages[event.status];
                window.setTimeout(function() { messagep.innerHTML = 'added fallback video for demo'; }, 2000);
                window.setTimeout(function() {
                    messagep.innerHTML = '';
                    override = false;
                }, 4000);
            }
        }, true);

    }
/**
 * Calculates an estimate of the position of the head of the user in relation to screen or camera
 *   based on input from facetrackrObject
 *
 * Usage:
 *	var hp = new headtrackr.headposition.Tracker(facetrackrObject, 640, 480);
 *	var currentPosition = hp.track(facetrackrObject);
 *
 * @author auduno / github.com/auduno
 */

    headtrackr.headposition = {};

/**
 *
 * Parameters to Tracker() are:
 *	facetrackrObject : a generic object with attributes x, y, width, height, angle
 *		which describe the position of center of detected face
 *	camwidth : width of canvas where the face was detected
 *	camheight : height of canvas where the face was detected
 *
 * Optional parameters can be passed along like this:
 *	 headtrackr.headposition.Tracker(facetrackrObject, 640, 480, {fov : 60})
 *
 * Optional parameters:
 *	 fov {number} : horizontal field of view of camera (default is to detect via distance to screen, any fov overrides distance_to_screen)
 *	 distance_to_screen {number} : initial distance from face to camera, in cms (default is 60 cm)
 *	 edgecorrection {boolean} : whether to use heuristic for position of head when detection is on the edge of the screen (default is true)
 *	 distance_from_camera_to_screen : distance from camera to center of screen (default is 11.5 cm, typical for laptops)
 *
 * Returns a generic object with attributes x, y, z which is estimated headposition in cm in relation to center of screen
 *
 * @constructor
 */
    headtrackr.headposition.Tracker = function(facetrackrObj, camwidth, camheight, params) {

        // some assumptions that are used when calculating distances and estimating horizontal fov
        //	 head width = 16 cm
        //	 head height = 19 cm
        //	 when initialized, user is approximately 60 cm from camera

        if (!params) params = {};

        if (params.edgecorrection === undefined) {
            var edgecorrection = true;
        } else {
            var edgecorrection = params.edgecorrection;
        }

        this.camheight_cam = camheight;
        this.camwidth_cam = camwidth;

        var head_width_cm = 16;
        var head_height_cm = 19;

        // angle between side of face and diagonal across
        var head_small_angle = Math.atan(head_width_cm / head_height_cm);

        var head_diag_cm =
            Math.sqrt((head_width_cm * head_width_cm) +
                (head_height_cm * head_height_cm)); // diagonal of face in real space

        var sin_hsa = Math.sin(head_small_angle); //precalculated sine
        var cos_hsa = Math.cos(head_small_angle); //precalculated cosine
        var tan_hsa = Math.tan(head_small_angle); //precalculated tan

        // estimate horizontal field of view of camera
        var init_width_cam = facetrackrObj.width;
        var init_height_cam = facetrackrObj.height;
        var head_diag_cam = Math.sqrt((init_width_cam * init_width_cam) + (init_height_cam * init_height_cam));
        if (params.fov === undefined) {
            // we use the diagonal of the faceobject to estimate field of view of the camera
            // we use the diagonal since this is less sensitive to errors in width or height
            var head_width_cam = sin_hsa * head_diag_cam;
            var camwidth_at_default_face_cm = (this.camwidth_cam / head_width_cam) * head_width_cm;
            // we assume user is sitting around 60 cm from camera (normal distance on a laptop)
            if (params.distance_to_screen === undefined) {
                var distance_to_screen = 60;
            } else {
                var distance_to_screen = params.distance_to_screen;
            }
            // calculate estimate of field of view
            var fov_width = Math.atan((camwidth_at_default_face_cm / 2) / distance_to_screen) * 2;
        } else {
            var fov_width = params.fov * Math.PI / 180;
        }

        // precalculate ratio between camwidth and distance
        var tan_fov_width = 2 * Math.tan(fov_width / 2);

        var x, y, z; // holds current position of head (in cms from center of screen)

        this.track = function(facetrackrObj) {

            var w = facetrackrObj.width;
            var h = facetrackrObj.height;
            var fx = facetrackrObj.x;
            var fy = facetrackrObj.y;

            if (edgecorrection) {
                // recalculate head_diag_cam, fx, fy

                var margin = 11;

                var leftDistance = fx - (w / 2);
                var rightDistance = this.camwidth_cam - (fx + (w / 2));
                var topDistance = fy - (h / 2);
                var bottomDistance = this.camheight_cam - (fy + (h / 2));

                var onVerticalEdge = (leftDistance < margin || rightDistance < margin);
                var onHorizontalEdge = (topDistance < margin || bottomDistance < margin);

                if (onHorizontalEdge) {
                    if (onVerticalEdge) {
                        // we are in a corner, use previous diagonal as estimate, i.e. don't change head_diag_cam
                        var onLeftEdge = (leftDistance < margin);
                        var onTopEdge = (topDistance < margin);

                        if (onLeftEdge) {
                            fx = w - (head_diag_cam * sin_hsa / 2);
                        } else {
                            fx = fx - (w / 2) + (head_diag_cam * sin_hsa / 2);
                        }

                        if (onTopEdge) {
                            fy = h - (head_diag_cam * cos_hsa / 2);
                        } else {
                            fy = fy - (h / 2) + (head_diag_cam * cos_hsa / 2);
                        }

                    } else {
                        // we are on top or bottom edge of camera, use width instead of diagonal and correct y-position
                        // fix fy
                        if (topDistance < margin) {
                            var originalWeight = topDistance / margin;
                            var estimateWeight = (margin - topDistance) / margin;
                            fy = h - (originalWeight * (h / 2) + estimateWeight * ((w / tan_hsa) / 2));
                            head_diag_cam = estimateWeight * (w / sin_hsa) +
                                originalWeight * (Math.sqrt((w * w) + (h * h)));
                        } else {
                            var originalWeight = bottomDistance / margin;
                            var estimateWeight = (margin - bottomDistance) / margin;
                            fy = fy - (h / 2) + (originalWeight * (h / 2) + estimateWeight * ((w / tan_hsa) / 2));
                            head_diag_cam = estimateWeight * (w / sin_hsa) +
                                originalWeight * (Math.sqrt((w * w) + (h * h)));
                        }
                    }
                } else if (onVerticalEdge) {
                    // we are on side edges of camera, use height and correct x-position
                    if (leftDistance < margin) {
                        var originalWeight = leftDistance / margin;
                        var estimateWeight = (margin - leftDistance) / margin;
                        head_diag_cam =
                            estimateWeight * (h / cos_hsa) + originalWeight * (Math.sqrt((w * w) + (h * h)));
                        fx = w - (originalWeight * (w / 2) + (estimateWeight) * (h * tan_hsa / 2));
                    } else {
                        var originalWeight = rightDistance / margin;
                        var estimateWeight = (margin - rightDistance) / margin;
                        head_diag_cam =
                            estimateWeight * (h / cos_hsa) + originalWeight * (Math.sqrt((w * w) + (h * h)));
                        fx = fx - (w / 2) + (originalWeight * (w / 2) + estimateWeight * (h * tan_hsa / 2));
                    }
                } else {
                    head_diag_cam = Math.sqrt((w * w) + (h * h));
                }
            } else {
                head_diag_cam = Math.sqrt((w * w) + (h * h));
            }

            // calculate cm-distance from screen
            z = (head_diag_cm * this.camwidth_cam) / (tan_fov_width * head_diag_cam);
            // to transform to z_3ds : z_3ds = (head_diag_3ds/head_diag_cm)*z
            // i.e. just use ratio

            // calculate cm-position relative to center of screen
            x = -((fx / this.camwidth_cam) - 0.5) * z * tan_fov_width;
            y = -((fy / this.camheight_cam) - 0.5) * z * tan_fov_width * (this.camheight_cam / this.camwidth_cam);


            // Transformation from position relative to camera, to position relative to center of screen
            if (params.distance_from_camera_to_screen === undefined) {
                // default is 11.5 cm approximately
                y = y + 11.5;
            } else {
                y = y + params.distance_from_camera_to_screen;
            }

            // send off event
            var evt = document.createEvent("Event");
            evt.initEvent("headtrackingEvent", true, true);
            evt.x = x;
            evt.y = y;
            evt.z = z;
            document.dispatchEvent(evt);

            return new headtrackr.headposition.TrackObj(x, y, z);
        }


        this.getTrackerObj = function() {
            return new headtrackr.headposition.TrackObj(x, y, z);
        }

        this.getFOV = function() {
            return fov_width * 180 / Math.PI;
        }
    };

/**
 * @constructor
 */
    headtrackr.headposition.TrackObj = function(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;

        this.clone = function() {
            var c = new headtrackr.headposition.TrackObj();
            c.x = this.x;
            c.y = this.y;
            c.z = this.z;
            return c;
        }
    };
/**
 * Optional controllers for handling headtrackr events
 *
 * @author auduno / github.com/auduno
 */

    headtrackr.controllers = {};

// NB! made for three.js revision 48. May not work with other revisions.

    headtrackr.controllers.three = {};

/**
 * Controls a THREE.js camera to create pseudo-3D effect
 *
 * Needs the position of "screen" in 3d-model to be given up front, and to be static (i.e. absolute) during headtracking
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} scaling The scaling of the "screen" in the 3d model. 
 *   This is the vertical size of screen in 3d-model relative to vertical size of computerscreen in real life
 * @param {array} fixedPosition array with attributes x,y,z, position of "screen" in 3d-model
 * @param {THREE.Vector3} lookAt the object/position the camera should be pointed towards
 * @param {object} params optional object with optional parameters
 *
 * Optional parameters:
 *   screenHeight : vertical size of computer screen (default is 20 cm, i.e. typical laptop size)
 */
    headtrackr.controllers.three.realisticAbsoluteCameraControl =
        function(camera, scaling, fixedPosition, lookAt, params) {

            if (params === undefined) params = {};
            if (params.screenHeight === undefined) {
                var screenHeight_cms = 20;
            } else {
                var screenHeight_cms = params.screenHeight;
            }
            if (params.damping === undefined) {
                params.damping = 1;
            }

            camera.position.x = fixedPosition[0];
            camera.position.y = fixedPosition[1];
            camera.position.z = fixedPosition[2];
            camera.lookAt(lookAt);

            var wh = screenHeight_cms * scaling;
            var ww = wh * camera.aspect;

            document.addEventListener('headtrackingEvent', function(event) {

                // update camera
                var xOffset = event.x > 0 ? 0 : -event.x * 2 * params.damping * scaling;
                var yOffset = event.y < 0 ? 0 : event.y * 2 * params.damping * scaling;
                camera.setViewOffset(ww + Math.abs(event.x * 2 * params.damping * scaling),
                    wh + Math.abs(event.y * params.damping * 2 * scaling), xOffset, yOffset, ww, wh);

                camera.position.x = fixedPosition[0] + (event.x * scaling * params.damping);
                camera.position.y = fixedPosition[1] + (event.y * scaling * params.damping);
                camera.position.z = fixedPosition[2] + (event.z * scaling);

                // update lookAt?

                // when changing height of window, we need to change field of view
                camera.fov = Math.atan((wh / 2 + Math.abs(event.y * scaling * params.damping)) /
                        (Math.abs(event.z * scaling))) *
                    360 /
                    Math.PI;
                //debugger;

                camera.updateProjectionMatrix();

            }, false);
        };

/**
 * Controls a THREE.js camera to create pseudo-3D effect
 *
 * Places "screen" in 3d-model in relation to original cameraposition at any given time
 * Currently not sure if this works properly, or at all
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} scaling The scaling of the "screen" in the 3d model. 
 *   This is the vertical size of screen in 3d-model relative to vertical size of computerscreen in real life
 * @param {array} relativeFixedDistance how long in front of (or behind) original cameraposition the fixed frame will be
 * @param {object} params optional object with optional parameters
 *
 * Optional parameters:
 *   screenHeight : vertical size of computer screen (default is 20 cm, i.e. typical laptop size)
 */
    headtrackr.controllers.three.realisticRelativeCameraControl =
        function(camera, scaling, relativeFixedDistance, params) {

            // we assume that the parent of camera is the scene

            if (params === undefined) params = {};
            if (params.screenHeight === undefined) {
                var screenHeight_cms = 20;
            } else {
                var screenHeight_cms = params.screenHeight;
            }

            var scene = camera.parent;

            var init = true;

            // create an object to offset camera without affecting existing camera interaction
            var offset = new THREE.Object3D();
            offset.position.set(0, 0, 0);
            offset.add(camera);
            scene.add(offset);

            // TODO : we maybe need to offset functions like lookAt as well
            //	use prototype function replacement for this?

            var wh = screenHeight_cms * scaling;
            var ww = wh * camera.aspect;

            // set fov
            document.addEventListener('headtrackingEvent', function(event) {

                // update camera
                var xOffset = event.x > 0 ? 0 : -event.x * 2 * scaling;
                var yOffset = event.y > 0 ? 0 : -event.y * 2 * scaling;
                camera.setViewOffset(ww + Math.abs(event.x * 2 * scaling), wh + Math.abs(event.y * 2 * scaling),
                    xOffset, yOffset, ww, wh);

                offset.rotation = camera.rotation;
                offset.position.x = 0;
                offset.position.y = 0;
                offset.position.z = 0;
                offset.translateX(event.x * scaling);
                offset.translateY(event.y * scaling);
                offset.translateZ((event.z * scaling) + relativeFixedDistance);

                //offset.position.x = (event.x * scaling);
                //offset.position.y = (event.y * scaling);
                //offset.position.z = (event.z * scaling)+relativeFixedDistance;

                // when changing height of window, we need to change field of view
                camera.fov = Math.atan((wh / 2 + Math.abs(event.y * scaling)) / (Math.abs(event.z * scaling))) *
                    360 /
                    Math.PI;

                camera.updateProjectionMatrix();

            }, false);
        }


    return headtrackr;
}));