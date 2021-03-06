/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2015, Arkena.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Arkena nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

MediaPlayer.models.ProtectionModel_10Dec2014 = function () {
    var self = null,
            videoElement = null,
            mediaKeys = null,
            mediaKeysPromise = null,
            keySystemAccessPromise = null,
            api = null,
            sessions = [],
            eventHandler = null,

            createEventHandler = function() {
                return {
                    handleEvent: function(event) {
                        switch (event.type) {
                            case api.encrypted:
                                self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_NEED_KEY,
                                    new MediaPlayer.vo.protection.NeedKey(event.initData, 'cenc'));
                                break;
                        }
                    }
                };
            },

            createSessionToken = function(keySession, initData) {
                return {
                    prototype: (new MediaPlayer.models.SessionToken()).prototype,
                    session: keySession,
                    sessionID: keySession.sessionId,
                    initData: initData,

                    handleEvent: function(event) {
                        switch (event.type) {
                            case api.message:
                                self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_MESSAGE,
                                        new MediaPlayer.vo.protection.KeyMessage(this, event.message, event.destinationURL));
                                break;
                        }
                    },
					
					getSessionID: function() {
						return this.session.sessionId;
					}
                };
            },

			removeSession = function (sessionToken) {
				for (var i = 0; i < sessions.length; i++) {
					if (sessions[i] === sessionToken) {
						sessions.splice(i, 1);
						break;
					}
				}
			};

    return {
        system: undefined,
        notify: undefined,
        subscribe: undefined,
        unsubscribe: undefined,
        keySystem: null,

        setup: function() {
            eventHandler = createEventHandler.call(this);
        },

        init: function() {
            self = this;
            api = MediaPlayer.models.ProtectionModel_10Dec2014.detect(document.createElement('video'));
        },

        teardown: function() {
            if (videoElement) {
                videoElement.removeEventListener(api.encrypted, eventHandler);
            }
            for (var i = 0; i < sessions.length; i++) {
                self.closeKeySession(sessions[i]);
            }
        },

        requestKeySystemAccess: function(ksConfigurations) {
            //jshint unused:false
			var element = videoElement || document.createElement('video');

            var found = false;
            for (var ksIdx = 0; ksIdx < ksConfigurations.length; ksIdx++) {
                var keySystem = ksConfigurations[ksIdx].ks;
                var configs = ksConfigurations[ksIdx].configs;
                var supportedVideo = null;

                for (var configIdx = 0; configIdx < configs.length; configIdx++) {
                    var videos = configs[configIdx].videoCapabilities;

                    if (videos && videos.length !== 0) {
                        supportedVideo = []; // Indicates that we have a requested video config
                        for (var videoIdx = 0; videoIdx < videos.length; videoIdx++) {
                            if (element.canPlayType(videos[videoIdx].contentType, keySystem.systemString) !== "") {
                                supportedVideo.push(videos[videoIdx]);
                            }
                        }
                    }

                    if (!supportedVideo ||
                            (supportedVideo && supportedVideo.length === 0) ||
							'com.widevine.alpha' !== keySystem.systemString) {
                        continue;
                    }

                    found = true;
                    self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SYSTEM_ACCESS_COMPLETE,
                            new MediaPlayer.vo.protection.KeySystemAccess(keySystem, new MediaPlayer.vo.protection.KeySystemConfiguration(null, supportedVideo)));
                    break;
                }
            }
            if (!found) {
                self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SYSTEM_ACCESS_COMPLETE,
                        null, "Key system access denied! -- No valid audio/video content configurations detected!");
            }
        },

        selectKeySystem: function(keySystemAccess) {
            self.keySystem = keySystemAccess.keySystem;
            keySystemAccessPromise = navigator.requestMediaKeySystemAccess(self.keySystem.systemString);
			self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SYSTEM_SELECTED);
        },

        setMediaElement: function(mediaElement) {
            if (videoElement) {
                videoElement.removeEventListener(api.encrypted, eventHandler().bind(this));
            }
            videoElement = mediaElement;
            videoElement.addEventListener(api.encrypted, eventHandler);
            if (mediaKeys) {
                self.setMediaKeys(mediaKeys);
            }
        },

        setMediaKeys: function (mediaKeys, initData) {
            var session = null,
                    sessionToken = null;

            if (videoElement && null === videoElement.mediaKeys) {
                videoElement[api.setMediaKeys](mediaKeys).then(function () {
                    if (initData) {
                        session = mediaKeys.createSession();
                        sessionToken = createSessionToken.call(this, session, initData);

                        session.addEventListener(api.message, sessionToken);

                        sessions.push(sessionToken);
                        
                        session[api.generateRequest]('cenc', initData).then(function () {
                            sessionToken.sessionID = session.sessionId;
							self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SESSION_CREATED, sessionToken);
                        }).catch(function () {
							self.closeKeySession(sessionToken);
                            self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SESSION_CREATED, null,
                                    new MediaPlayer.vo.protection.KeyError(sessionToken, 'Failed to create keySession'));
                        });
                    }
                }).catch(function (e) { });
            }
        },

        createKeySession: function (initData, contentType, initDataType, hasDelayed) {
            //jshint unused:false
            if (!this.keySystem || (!mediaKeys && !keySystemAccessPromise)) {
                if (hasDelayed) {
                    throw new Error('Can not create sessions until you have selected a key system');
                }
                
                setTimeout(function () {
                    self.createKeySession(initData, contentType, initDataType, true);
                }, 1000);
                
                return;
            }
            
            if (mediaKeys) {
                self.setMediaKeys(mediaKeys, initData);
            }
            else {
                keySystemAccessPromise.then(function (keySystemAccess) {
                    keySystemAccess.createMediaKeys().then(function (_mediaKeys) {

                        mediaKeysPromise = null;
                        mediaKeys = _mediaKeys;

                        self.setMediaKeys(mediaKeys, initData);
                    });
                });
            }
        },

        updateKeySession: function (sessionToken, message) {
            sessionToken.session[api.update](message);
        },

        closeKeySession: function (sessionToken) {
            var session = sessionToken.session;

            session.removeEventListener(api.message, sessionToken);

			removeSession(session);

            session[api.release]();
			
			self.notify(MediaPlayer.models.ProtectionModel.eventList.ENAME_KEY_SESSION_CLOSED, sessionToken.getSessionID());
        }
    };
};

// Defines the supported 10Dec2014 API variations
MediaPlayer.models.ProtectionModel_10Dec2014.APIs = [
    {
        // Navigator
        requestMediaKeySystemAccess: 'requestMediaKeySystemAccess',
        
        // Video Element
        setMediaKeys: 'setMediaKeys',

        // MediaKeys
        MediaKeys: 'MediaKeys',

        // MediaKeySession
        generateRequest: 'generateRequest',
        release: 'close',
        update: 'update',

        // Events
        encrypted: 'encrypted',
        message: 'message',
        keyschange: 'keyschange'
    }
];

/**
 * Detects presence of EME v10Dec2014 APIs
 *
 * @param videoElement {HTMLMediaElement} the media element that will be
 * used for detecting APIs
 * @returns an API object that is used when initializing the ProtectionModel
 * instance
 */
MediaPlayer.models.ProtectionModel_10Dec2014.detect = function(videoElement) {
    //jshint unused:false
    var apis = MediaPlayer.models.ProtectionModel_10Dec2014.APIs;
    if ('object' === typeof (navigator)) {
        for (var i = 0; i < apis.length; i++) {
            var api = apis[i];
            if ('function' !== typeof (navigator[api.requestMediaKeySystemAccess]) || 1 !== navigator[api.requestMediaKeySystemAccess].length) {
                continue;
            }
            
            return api;
        }
    }
    
    return null;
};

MediaPlayer.models.ProtectionModel_10Dec2014.prototype = {
    constructor: MediaPlayer.models.ProtectionModel_10Dec2014
};