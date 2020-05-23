(function ($) {
	// TODO on the first load of the camera, it hangs while 'finding resolutions'
	const TRANSFORM_ATTRIBUTE = 'data-transform';

	const coalesce = function (countval, func, wait) {
		let timeout;
		let count = 0;
		return function () {
			const context = this, args = arguments;
			const later = function () {
				clearTimeout(timeout);
				timeout = null;
				if (count) {
					const callArgs = [].slice.call(args);
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
	const setTransform = function ($dest, destContext, srcContext, scale, x, y) {
		$dest.attr(TRANSFORM_ATTRIBUTE, 'matrix(' + scale + ', 0,0,' + scale + ',' + x + ',' + y + ')');

		destContext.setTransform(scale, 0, 0, scale, x, y);
		destContext.drawImage(srcContext.canvas, 0, 0);
	};
	const applyTransform = function ($container, srcContext, destContext, ds, dx, dy) {
		const $src = $(srcContext.canvas);
		const $dest = $(destContext.canvas);
		const transform = $dest.attr(TRANSFORM_ATTRIBUTE);
		let scale = 1, x = 0, y = 0;
		if (transform) {
			const t = transform.match(
					/matrix\((-?\d*\.?\d+),\s*0,\s*0,\s*\d*\.?\d+,\s*(-?\d+.?\d*).*?,\s*(-?\d+.?\d*).*?\)/);
			scale = parseFloat(t[1]), x = parseFloat(t[2]), y = parseFloat(t[3]);
		}
		if (isNaN(scale))
			scale = 1;
		const iw = $src[0].width; // original image width
		const ih = $src[0].height;
		const cw = $container[0].clientWidth; // container width
		const ch = $container[0].clientHeight;
		let sw = (iw * scale); // scale width
		let sh = (ih * scale);

		const newScale = Math.min(1.5, Math.max(scale + ds,
												cw / iw,
												ch / ih));

		if (ds) {
			if (newScale !== scale) {
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

		const xmax = sw - cw;
		const ymax = sh - ch;
		x = Math.max(-xmax, Math.min(0, x));
		y = Math.max(-ymax, Math.min(0, y));

		setTransform($dest, destContext, srcContext, scale, x, y);
	};
	const isDroppable = function (ev) {
		const dt = ev.originalEvent.dataTransfer;
		if (dt && dt.items) {
			const i = dt.items["0"];
			return i.kind == 'file' && (i.type == "application/x-moz-file" || i.type.startsWith('image'));
		}
		return false;
	};

	const setup = function ($photoUpload) {
		const $filename = $photoUpload.find('.filename');
		const $file = $photoUpload.find('input[type=file]');
		const $clear = $photoUpload.find('button.clear');
		const $useCamera = $photoUpload.find('button.use-camera');
		const $status = $photoUpload.find('.status');
		const $tip = $photoUpload.find('.tip');
		const $hidden = $photoUpload.find('input[name=profileResult]');
		const $video = $photoUpload.find('video');
		const $offscreenCanvas = $photoUpload.find('canvas.offscreen');
		const $resultCanvas = $photoUpload.find('canvas.result');
		const $imageCanvas = $photoUpload.find('canvas.image');
		const $image = $photoUpload.find('.img-container img');

		const size = {width: $photoUpload[0].clientWidth, height: $photoUpload[0].clientHeight}; // 5

		const offscreenContext = $offscreenCanvas[0].getContext('2d');
		const resultContext = $resultCanvas[0].getContext('2d');
		const imageContext = $imageCanvas[0].getContext('2d');

		const htracker = new headtrackr.Tracker({
													calcAngles: false,
													ui: false,
													headPosition: false,
													smoothing: false,
													whitebalancing: false,
													detectionInterval: 15,
												});

		const diff = function (a, b) { return Math.abs((a - b) / b); };
		let scale = 0;
		let captured = false;
		let foundFace = false;
		let previewAspectRatio;
		let faceEvent;
		let dragX = 0;
		let dragY = 0;


		const reset = function () {
			$file.val('');
			$photoUpload.removeClass('loading success error streaming uploading');
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

		const getVideoAspectRatio = function (callback) {
			// The user is asked twice about the camera when running from a file or from an insecure server, it asks twice.

			const res1080p = {width: 1920, height: 1080}; // 5

			navigator.mediaDevices.getUserMedia({
													audio: false,
													video: {optional: [{minWidth: res1080p.width}, {minHeight: res1080p.height}]}
												}).then(function (stream) {
				let tryCount = 0;
				const video = $video[0];
				video.srcObject = stream;
				const interval = setInterval(function () {
					if (tryCount > 100) {

						clearInterval(interval);
						$status.text("Could not determine aspect ratio");
						video.srcObject = null;
					}
					tryCount++;
					const w = video.videoWidth;
					const h = video.videoHeight;
					const videoAr = w / h;
					if (!isNaN(videoAr)) {
						clearInterval(interval);
						video.remove();
						const tracks = stream.getTracks();
						for (let track in tracks) {
							tracks[track].stop();
						}
						callback(videoAr);
					}
				}, 15);
			}).catch(function (err) {
				console.error(err);
				$status.text("Error: " + err.name + "; " + err.message);
				$('<br/><a href="#">reset</a>').on('click', function (ev) {
					ev.preventDefault();
					reset();
				}).appendTo($status);
			});


		};

		const trySetTransformFromRect = function (x, y, w, h, angle) {
			const cdW = $offscreenCanvas.width();
			const cdH = $offscreenCanvas.height();
			const cW = $photoUpload[0].clientWidth;
			const cH = $photoUpload[0].clientHeight;

			const newScale = Math.max(Math.max(cW / cdW, cH / cdH), Math.min(cW / w, cH / h) * .8);
			if (diff(scale, newScale) > .03)
				scale = newScale;


			//offscreenContext.translate(x, y);
			//offscreenContext.rotate(angle - (Math.PI / 2));

			const tY = -y * scale + cH / 2;
			const tX = -x * scale + cW / 2;

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

		const loadImageFromDataUrl = function (dataUrl, callback) {
			const img = new Image();
			img.onload = function () {
				// TODO reduce size of large images
				const w = img.width;
				const h = img.height;
				const cw = $photoUpload[0].clientWidth; // container width
				const ch = $photoUpload[0].clientHeight;
				const s = 1 - Math.max(cw / w, ch / h);
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

		const useFiles = function (files) {
			$photoUpload.addClass('uploading');
			$status.text('Reading image...');
			const reader = new FileReader();
			const file = files[0];
			$filename.text(file.name);

			reader.onload = function (readEvent) {
				loadImageFromDataUrl(readEvent.target.result, function () {
					// TODO try to find face on drop
					$status.text('Detecting face...');
					setTimeout(function () {
						const t = new headtrackr.facetrackr.Tracker({whitebalancing: false});
						t.init($offscreenCanvas[0]);
						for (let i = 0; i < 2; i++) { // two iterations, JV, CS
							t.track();
						}
						$status.text('');
					}, 0);

					//trySetTransformFromRect(r.x, r.y, r.width, r.height);
				});

			}
			reader.readAsDataURL(files[0]);
		};

		$photoUpload.init.prototype.grabProfileResultAsDataUrl = function () {
			let offscreenCanvas = $offscreenCanvas[0];
			if (offscreenCanvas.width > 0 && offscreenCanvas.height > 0) {

				const canvas = document.createElement('canvas');

				const transform = $imageCanvas.attr(TRANSFORM_ATTRIBUTE);
				let scale = 1, x = 0, y = 0, w = 0, h = 0;
				if (transform) {
					const t = transform.match(
							/matrix\((-?\d*\.?\d+),\s*0,\s*0,\s*\d*\.?\d+,\s*(-?\d+.?\d*).*?,\s*(-?\d+.?\d*).*?\)/);
					scale = parseFloat(t[1]), x = parseFloat(t[2]), y = parseFloat(t[3]);
					w = $photoUpload[0].clientWidth / scale;
					h = $photoUpload[0].clientHeight / scale;
				}

				canvas.width = w;
				canvas.height = h;

				let context = canvas.getContext('2d');
				context.fillStyle = "white";
				context.fillRect(0, 0, h, w);
				context.drawImage(offscreenCanvas, -x / scale, -y / scale, w, h, 0, 0, w, h);
				return canvas.toDataURL('image/png');
			}
			return null;
		};

		document.addEventListener('facetrackingEvent', function (event) {
			if (event.detection === 'CS') {
				foundFace = true;
				$status.text('');
				faceEvent = event;
			}
			if (faceEvent)
				trySetTransformFromRect(faceEvent.x, faceEvent.y, faceEvent.width, faceEvent.height, faceEvent.angle);

		});
		document.addEventListener('headtrackrStatus', function (event) {
			if (event.status === 'whitebalance' || event.status === 'detecting') {
				captured = true;
				$status.text('Finding face...');
			}
		});

		$useCamera.on('click', function (ev) {
			ev.preventDefault();
			reset();
			$photoUpload.addClass('streaming');
			$status.text('Detecting resolution...');
			getVideoAspectRatio(function (aspectRatio) {
				previewAspectRatio = {width: 1080 * aspectRatio, height: 1080};
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
		}).on('mousedown', function (ev) {
			ev.stopPropagation();
		});

		$resultCanvas.on('click', function (ev) {
			// TODO clicking before the stream starts causes blank image
			const killInterval = setInterval(function () {
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

		$file.on('change', function (ev) {
			useFiles(ev.originalEvent.target.files);
		});

		$clear.on('click', function (ev) {
			ev.preventDefault();
			$hidden.removeAttr('disabled');
			reset();
		}).on('mousedown', function (ev) {
			ev.stopPropagation();
		});

		$photoUpload.on('drag dragstart dragend dragover dragenter dragleave drop', function (e) {
			e.preventDefault();
			e.stopPropagation();
		}).on('dragover dragenter', function (ev) {
			if (isDroppable(ev))
				$photoUpload.addClass('dragover');
		}).on('dragleave dragend drop', function (ev) {
			$photoUpload.removeClass('dragover');
		}).on('drop', function (ev) {
			ev.preventDefault();
			$photoUpload.removeClass('dragover');
			const dt = ev.originalEvent.dataTransfer;
			if (dt && dt.files) {
				if (isDroppable(ev)) {
					useFiles(dt.files);

					// TODO clear files so form doesn't submit them?
				}
			}
		}).on('mousedown touchstart', function (ev) {
			if ($photoUpload.is('.success:not(.streaming)') && ev.target === $imageCanvas[0]) {

				const oe = ev.originalEvent;
				if (ev.type === 'touchstart') {
					const touch = oe.changedTouches[0];
					dragX = touch.screenX;
					dragY = touch.screenY;
				} else {
					if (ev.buttons !== 1)
						return;
					dragX = oe.screenX;
					dragY = oe.screenY;
				}

				$photoUpload.addClass('moving');
				ev.preventDefault();
			}

		}).on('wheel', coalesce(function (ev) {
			ev.preventDefault();
			return -ev.originalEvent.deltaY;
		}, function (ev, count) {
			applyTransform($photoUpload, offscreenContext, imageContext, .0001 * count, 0, 0);
		}, 15));

		$(document).on('mousemove touchmove', function (ev) {
			if ($photoUpload.is('.moving')) {
				let moveX;
				let moveY;
				const oe = ev.originalEvent;
				if (ev.type === 'touchmove') {
					const touch = oe.changedTouches[0];
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
		}).on('mouseup touchend', function (ev) {
			$photoUpload.removeClass('moving');
		});

		$photoUpload.closest('form').on('submit', function (ev) {
			// TODO this effectively crops it, maybe we want to keep the original?
			try {
				if ($photoUpload.is('.success')) {
					$hidden.val($photoUpload.grabProfileResultAsDataUrl());
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
			loadImageFromDataUrl($image.attr('src'), function () { $image.remove(); });


	};


	$('.profile-picker').each(function () {
		setup($(this));
	});


})(jQuery);