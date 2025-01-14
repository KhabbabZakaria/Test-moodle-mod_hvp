/** @namespace H5P */
H5P.VideoVideojs = (function ($) {

    /**
     * HTML5 video player for H5P.
     *
     * @class
     * @param {Array} sources Video files to use
     * @param {Object} options Settings for the player
     * @param {Object} l10n Localization strings
     */
    function Videojs(sources, options, l10n) {
      var self = this;
  
      /**
       * Displayed when the video is buffering
       * @private
       */
      var $throbber = $('<div/>', {
        'class': 'h5p-video-loading'
      });
  
      /**
       * Used to display error messages
       * @private
       */
      var $error = $('<div/>', {
        'class': 'h5p-video-error'
      });
  
      /**
       * Keep track of current state when changing quality.
       * @private
       */
      var stateBeforeChangingQuality;
      var currentTimeBeforeChangingQuality;
  
      /**
       * Avoids firing the same event twice.
       * @private
       */
      var lastState;
  
      /**
       * Keeps track whether or not the video has been loaded.
       * @private
       */
      var isLoaded = false;
  
      // Create player
      var video = document.createElement('video');
  
      // Sort sources into qualities
      var qualities = getQualities(sources, video);
  
      // Select quality and source
      var currentQuality = getPreferredQuality();
      if (currentQuality === undefined || qualities[currentQuality] === undefined) {
        // No preferred quality, pick the first.
        for (currentQuality in qualities) {
          if (qualities.hasOwnProperty(currentQuality)) {
            break;
          }
        }
      }
      
      var readyStateCheckInterval = setInterval(function() {
              if (document.readyState === "complete") {
                      clearInterval(readyStateCheckInterval);
                      var player = videojs(video, {techOrder: ["html5", "flash"]});
                      player.ready(function() {
                      player.src({
                              src: sources[0].path,
                              type: 'application/dash+xml'
                      });
              });	
              }
      }, 10);
  
      // Setting webkit-playsinline, which makes iOS 10 beeing able to play video
      // inside browser.
      video.setAttribute('id', 'h5pvideo');
      video.setAttribute('name', 'h5pvideo');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('preload', 'metadata');
      
      // Set options
      video.controls = (options.controls ? true : false);
      video.autoplay = (options.autoplay ? true : false);
      video.loop = (options.loop ? true : false);
      video.className = 'h5p-video';
      video.style.display = 'block';
  
      // add ratechangelistener
      video.addEventListener('ratechange', function () {
        self.trigger('playbackRateChange', self.getPlaybackRate());
      });
  
      if (options.fit) {
        // Style is used since attributes with relative sizes aren't supported by IE9.
        video.style.width = '100%';
        video.style.height = '100%';
      }
      // Add poster if provided
      if (options.poster) {
        video.poster = options.poster;
      }
  
      /**
       * Register track to video
       *
       * @param {Object} trackData Track object
       * @param {string} trackData.kind Kind of track
       * @param {Object} trackData.track Source path
       * @param {string} [trackData.label] Label of track
       * @param {string} [trackData.srcLang] Language code
       */
      var addTrack = function (trackData) {
        // Skip invalid tracks
        if (!trackData.kind || !trackData.track.path) {
          return;
        }
  
        var track = document.createElement('track');
        track.kind = trackData.kind;
        track.src = trackData.track.path;
        if (trackData.label) {
          track.label = trackData.label;
        }
  
        if (trackData.srcLang) {
          track.srcLang = trackData.srcLang;
        }
  
        return track;
      };
  
      // Register tracks
      options.tracks.forEach(function (track, i) {
        var trackElement = addTrack(track);
        if (i === 0) {
          trackElement.default = true;
        }
        if (trackElement) {
          video.appendChild(trackElement);
        }
      });
  
      /**
       * Helps registering events.
       *
       * @private
       * @param {String} native Event name
       * @param {String} h5p Event name
       * @param {String} [arg] Optional argument
       */
      var mapEvent = function (native, h5p, arg) {
        video.addEventListener(native, function () {
          switch (h5p) {
            case 'stateChange':
            //alert('stateChange');
              if (lastState === arg) {
                return; // Avoid firing event twice.
              }
  
              var validStartTime = options.startAt && options.startAt > 0;
              if (arg === H5P.Video.PLAYING && validStartTime) {
                video.currentTime = options.startAt;
                delete options.startAt;
              }
              break;
  
            case 'loaded':
              //alert('loaded');
              isLoaded = true;
  
              if (stateBeforeChangingQuality !== undefined) {
                return; // Avoid loaded event when changing quality.
              }
  
              // Remove any errors
              if ($error.is(':visible')) {
                $error.remove();
              }
  
              if (OLD_ANDROID_FIX) {
                var andLoaded = function () {
                  video.removeEventListener('durationchange', andLoaded, false);
                  // On Android seeking isn't ready until after play.
                  self.trigger(h5p);
                };
                video.addEventListener('durationchange', andLoaded, false);
                return;
              }
              break;
  
            case 'error':
            alert('error');
              // Handle error and get message.
              arg = error(arguments[0], arguments[1]);
              break;
          }
          self.trigger(h5p, arg);
        }, false);
      };
  
      /**
       * Handle errors from the video player.
       *
       * @private
       * @param {Object} code Error
       * @param {String} [message]
       * @returns {String} Human readable error message.
       */
      var error = function (code, message) {
        if (code instanceof Event) {
  
          // No error code
          if (!code.target.error) {
            return '';
          }
  
          switch (code.target.error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              message = l10n.aborted;
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              message = l10n.networkFailure;
              break;
            case MediaError.MEDIA_ERR_DECODE:
              message = l10n.cannotDecode;
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              message = l10n.formatNotSupported;
              break;
            case MediaError.MEDIA_ERR_ENCRYPTED:
              message = l10n.mediaEncrypted;
              break;
          }
        }
        if (!message) {
          message = l10n.unknownError;
        }
  
        // Hide throbber
        $throbber.remove();
  
        // Display error message to user
        $error.text(message).insertAfter(video);
  
        // Pass message to our error event
        return message;
      };
  
      /**
       * Appends the video player to the DOM.
       *
       * @public
       * @param {jQuery} $container
       */
      self.appendTo = function ($container) {
        $container.append(video);
      };
  
      /**
       * Get list of available qualities. Not available until after play.
       *
       * @public
       * @returns {Array}
       */
      self.getQualities = function () {
        // Create reverse list
        var options = [];
        for (var q in qualities) {
          if (qualities.hasOwnProperty(q)) {
            options.splice(0, 0, {
              name: q,
              label: qualities[q].label
            });
          }
        }
  
        if (options.length < 2) {
          // Do not return if only one quality.
          return;
        }
  
        return options;
      };
  
      /**
       * Get current playback quality. Not available until after play.
       *
       * @public
       * @returns {String}
       */
      self.getQuality = function () {
        return currentQuality;
      };
  
      /**
       * Set current playback quality. Not available until after play.
       * Listen to event "qualityChange" to check if successful.
       *
       * @public
       * @params {String} [quality]
       */
      self.setQuality = function (quality) {
        if (qualities[quality] === undefined || quality === currentQuality) {
          return; // Invalid quality
        }
  
        // Keep track of last choice
        setPreferredQuality(quality);
  
        // Avoid multiple loaded events if changing quality multiple times.
        if (!stateBeforeChangingQuality) {
          // Keep track of last state
          stateBeforeChangingQuality = lastState;
  
          // Keep track of current time
          currentTimeBeforeChangingQuality = video.currentTime;
  
          // Seek and start video again after loading.
          var loaded = function () {
            video.removeEventListener('loadedmetadata', loaded, false);
            if (OLD_ANDROID_FIX) {
              var andLoaded = function () {
                video.removeEventListener('durationchange', andLoaded, false);
                // On Android seeking isn't ready until after play.
                self.seek(currentTimeBeforeChangingQuality);
              };
              video.addEventListener('durationchange', andLoaded, false);
            }
            else {
              // Seek to current time.
              self.seek(currentTimeBeforeChangingQuality);
            }
  
            // Always play to get image.
            video.play();
  
            if (stateBeforeChangingQuality !== H5P.Video.PLAYING) {
              // Do not resume playing
              video.pause();
            }
  
            // Done changing quality
            stateBeforeChangingQuality = undefined;
  
            // Remove any errors
            if ($error.is(':visible')) {
              $error.remove();
            }
          };
          video.addEventListener('loadedmetadata', loaded, false);
        }
  
        // Keep track of current quality
        currentQuality = quality;
        self.trigger('qualityChange', currentQuality);
  
        // Display throbber
        self.trigger('stateChange', H5P.Video.BUFFERING);
  
        // Change source
        video.src = qualities[quality].source.path; // (iPad does not support #t=).
  
        // Remove poster so it will not show during quality change
        video.removeAttribute('poster');
      };
  
      /**
       * Starts the video.
       *
       * @public
       * @return {Promise|undefined} May return a Promise that resolves when
       * play has been processed.
       */
      self.play = function () {
        if ($error.is(':visible')) {
          return;
        }
  
        if (!isLoaded) {
          // Make sure video is loaded before playing
          video.load();
        }
  
        return video.play();
      };
  
      /**
       * Pauses the video.
       *
       * @public
       */
      self.pause = function () {
        video.pause();
      };
  
      /**
       * Seek video to given time.
       *
       * @public
       * @param {Number} time
       */
      self.seek = function (time) {
        if (lastState === undefined) {
          // Make sure we always play before we seek to get an image.
          // If not iOS devices will reset currentTime when pressing play.
          video.play();
          video.pause();
        }
  
        video.currentTime = time;
      };
  
      /**
       * Get elapsed time since video beginning.
       *
       * @public
       * @returns {Number}
       */
      self.getCurrentTime = function () {
        return video.currentTime;
      };
  
      /**
       * Get total video duration time.
       *
       * @public
       * @returns {Number}
       */
      self.getDuration = function () {
        if (isNaN(video.duration)) {
          return;
        }
  
        return video.duration;
      };
  
      /**
       * Get percentage of video that is buffered.
       *
       * @public
       * @returns {Number} Between 0 and 100
       */
      self.getBuffered = function () {
        // Find buffer currently playing from
        var buffered = 0;
        for (var i = 0; i < video.buffered.length; i++) {
          var from = video.buffered.start(i);
          var to = video.buffered.end(i);
  
          if (video.currentTime > from && video.currentTime < to) {
            buffered = to;
            break;
          }
        }
  
        // To percentage
        return buffered ? (buffered / video.duration) * 100 : 0;
      };
  
      /**
       * Turn off video sound.
       *
       * @public
       */
      self.mute = function () {
        video.muted = true;
      };
  
      /**
       * Turn on video sound.
       *
       * @public
       */
      self.unMute = function () {
        video.muted = false;
      };
  
      /**
       * Check if video sound is turned on or off.
       *
       * @public
       * @returns {Boolean}
       */
      self.isMuted = function () {
        return video.muted;
      };
  
      /**
       * Returns the video sound level.
       *
       * @public
       * @returns {Number} Between 0 and 100.
       */
      self.getVolume = function () {
        return video.volume * 100;
      };
  
      /**
       * Set video sound level.
       *
       * @public
       * @param {Number} level Between 0 and 100.
       */
      self.setVolume = function (level) {
        video.volume = level / 100;
      };
  
      /**
       * Get list of available playback rates.
       *
       * @public
       * @returns {Array} available playback rates
       */
      self.getPlaybackRates = function () {
        /*
         * not sure if there's a common rule about determining good speeds
         * using Google's standard options via a constant for setting
         */
        var playbackRates = PLAYBACK_RATES;
  
        return playbackRates;
      };
  
      /**
       * Get current playback rate.
       *
       * @public
       * @returns {Number} such as 0.25, 0.5, 1, 1.25, 1.5 and 2
       */
      self.getPlaybackRate = function () {
        return video.playbackRate;
      };
  
      /**
       * Set current playback rate.
       * Listen to event "playbackRateChange" to check if successful.
       *
       * @public
       * @params {Number} suggested rate that may be rounded to supported values
       */
      self.setPlaybackRate = function (playbackRate) {alert ("playbackRate");
        video.playbackRate = playbackRate;
      };
  
      // Register event listeners
      mapEvent('ended', 'stateChange', H5P.Video.ENDED);
      mapEvent('playing', 'stateChange', H5P.Video.PLAYING);
      mapEvent('pause', 'stateChange', H5P.Video.PAUSED);
      mapEvent('waiting', 'stateChange', H5P.Video.BUFFERING);
      mapEvent('loadedmetadata', 'loaded');
      mapEvent('error', 'error');
  
      if (!video.controls) {
        // Disable context menu(right click) to prevent controls.
        video.addEventListener('contextmenu', function (event) {
          event.preventDefault();
        }, false);
      }
  
      // Display throbber when buffering/loading video.
      self.on('stateChange', function (event) {
        var state = event.data;
        lastState = state;
        if (state === H5P.Video.BUFFERING) {
          $throbber.insertAfter(video);
        }
        else {
          $throbber.remove();
        }
      });
  
      // Video controls are ready
      setTimeout(function () {
        self.trigger('ready');
      }, 0);
    }
  
    /**
     * Check to see if we can play any of the given sources.
     *
     * @public
     * @static
     * @param {Array} sources
     * @returns {Boolean}
     */
    Videojs.canPlay = function (sources) {
      // Cycle through sources
      for (var i = 0; i < sources.length; i++) {
        var type = getType(sources[i]);
        if (sources[i].mime === 'application/dash+xml' || /\.mpd$/.test(sources[i].path)) {     
          // We should be able to play this
          return true;
        }
      }
  
      return false;
    };
  
    /**
     * Find source type.
     *
     * @private
     * @param {Object} source
     * @returns {String}
     */
    var getType = function (source) {
      var type = source.mime;
      if (!type) {
        // Try to get type from URL
        var matches = source.path.match(/\.(\w+)$/);
        if (matches && matches[1]) {
          type = 'video/' + matches[1];
        }
      }
  
      if (type && source.codecs) {
        // Add codecs
        type += '; codecs="' + source.codecs + '"';
      }
  
      return type;
    };
  
    /**
     * Sort sources into qualities.
     *
     * @private
     * @static
     * @param {Array} sources
     * @param {Object} video
     * @returns {Object} Quality mapping
     */
    var getQualities = function (sources, video) {
      var qualities = {};
      var qualityIndex = 1;
      var lastQuality;
  
      // Cycle through sources
      for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
  
        // Find and update type.
        var type = source.type = getType(source);
  
        // Check if we support this type
        if (!type || video.canPlayType(type) === '') {
          continue; // We cannot play this source
        }
  
        if (source.quality === undefined) {
          /* No quality metadata. Create a dummy tag to seperate multiple
          sources of the same type, e.g. if two mp4 files have been uploaded. */
  
          if (lastQuality === undefined || qualities[lastQuality].source.type === type) {
            // Create a new quality tag
            source.quality = {
              name: 'q' + qualityIndex,
              label: 'Quality ' + qualityIndex // TODO: l10n
            };
            qualityIndex++;
          }
          else {
            // Tag as the same quality as the last source
            source.quality = qualities[lastQuality].source.quality;
          }
        }
  
        // Log last quality
        lastQuality = source.quality.name;
  
        // Look to see if quality exists
        var quality = qualities[lastQuality];
        if (quality) {
          // We have a source with this quality. Check if we have a better format.
          if (source.mime.split('/')[1] === PREFERRED_FORMAT) {
            quality.source = source;
          }
        }
        else {
          // Add new source with quality.
          qualities[source.quality.name] = {
            label: source.quality.label,
            source: source
          };
        }
      }
  
      return qualities;
    };
  
    /**
     * Set preferred video quality.
     *
     * @private
     * @static
     * @param {String} quality Index of preferred quality
     */
    var setPreferredQuality = function (quality) {
      var settings = document.cookie.split(';');
      for (var i = 0; i < settings.length; i++) {
        var setting = settings[i].split('=');
        if (setting[0] === 'H5PVideoQuality') {
          setting[1] = quality;
          settings[i] = setting.join('=');
          document.cookie = settings.join(';');
          return;
        }
      }
  
      document.cookie = 'H5PVideoQuality=' + quality + '; ' + document.cookie;
    };
  
    /**
     * Set preferred video quality.
     *
     * @private
     * @static
     * @returns {String} Index of preferred quality
     */
    var getPreferredQuality = function () {
      var quality, settings = document.cookie.split(';');
      for (var i = 0; i < settings.length; i++) {
        var setting = settings[i].split('=');
        if (setting[0] === 'H5PVideoQuality') {
          quality = setting[1];
          break;
        }
      }
  
      return quality;
    };
  
    /** @constant {Boolean} */
    var OLD_ANDROID_FIX = false;
  
    /** @constant {Boolean} */
    var PREFERRED_FORMAT = 'mp4';
  
    /** @constant {Object} */
    var PLAYBACK_RATES = [0.25, 0.5, 1, 1.25, 1.5, 2];
  
    if (navigator.userAgent.indexOf('Android') !== -1) {
      // We have Android, check version.
      var version = navigator.userAgent.match(/AppleWebKit\/(\d+\.?\d*)/);
      if (version && version[1] && Number(version[1]) <= 534.30) {
        // Include fix for devices running the native Android browser.
        // (We don't know when video was fixed, so the number is just the lastest
        // native android browser we found.)
        OLD_ANDROID_FIX = true;
      }
    }
    else {
      if (navigator.userAgent.indexOf('Chrome') !== -1) {
        // If we're using chrome on a device that isn't Android, prefer the webm
        // format. This is because Chrome has trouble with some mp4 codecs.
        PREFERRED_FORMAT = 'webm';
      }
    }
  
    return Videojs;
  })(H5P.jQuery);
  
  // Register video handler
  H5P.videoHandlers = H5P.videoHandlers || [];
  H5P.videoHandlers.push(H5P.VideoVideojs);
