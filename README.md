# homebridge-tv-cec-platform

[![NPM version](https://badge.fury.io/js/homebridge-cec-tv-control.svg)](https://npmjs.org/package/homebridge-cec-tv-control)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

Homebridge support for controlling a TV via HDMI-CEC commands.

## IMPORTANT
This is **very** much a work-in-progress.  Bugs are to be expected.

Javascript and Typescript are not my main languages -- pointers, tips, and input are all welcome!

## Installation
1. This is a plugin for Homebridge, so you'll need to install [homebridge](https://github.com/homebridge/homebridge) if you haven't already.  Be sure to install Node and NPM as well.
2. Install the plugin using NPM: `sudo npm install -g homebridge-cec-tv-control`
3. Install the `cec-utils` package if the `cec-client` command is not present in your terminal: `sudo apt-get install cec-utils`
* Additionally, cec-utils might not be available based on what distribution you're using.  You can also search for libCEC, as that might be packaged and available in your package manager.
* On Raspberry Pi's OSMC image, `cec-cilent` is present at `/usr/osmc/bin/cec-client-4.0.2`, you'll need to run `sudo ln -s /usr/osmc/bin/cec-client-4.0.2 /usr/bin/cec-client` to link it to the default `$PATH` 
4. Add the `CECTVControl` platform to your configuration file.  If you're using [homebridge-ui-x](https://github.com/oznu/homebridge-config-ui-x) you should be able to configure this right in the UI.  Otherwise, you can see an example configuration below.
5. Since this plugin gets registered as an External Accessory in Homebridge, you'll need to register it manually and input your Homebridge authentication code to link it.  More information is output in the Homebridge log when the plugin is loaded.

### Config

```json
platforms": [
    {
        "name": "CEC TV",
        "pluginEnabled": true,
        "pollingInterval": 2500,
        "platform": "CECTVControl"
    }
]
```
* `pluginEnabled` - If this is set to false, the plugin will not initialize and won't be added to Homebridge.  Essentially this is a way to keep it installed, but not active.
* `pollingInterval` - **[Required]** This dictates how often the platform will try to query the HDMI-CEC device for its status.  This helps keep things in sync in Homekit if other devices (remotes, other CEC-enabled devices) change your device status.  This value is in milliseconds, so the default 2500 equates to 2.5 seconds.


*Based on Dominick Han's [homebridge-tv-cec plugin](https://github.com/dominick-han/homebridge-tv-cec)*
*Uses cec-client, which is part of [Pulse-Eight's libCEC](https://github.com/Pulse-Eight/libcec).*
