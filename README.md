# homebridge-cec-tv-control

[![NPM version](https://badge.fury.io/js/homebridge-cec-tv-control.svg)](https://npmjs.org/package/homebridge-cec-tv-control)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

Homebridge support for controlling a TV via HDMI-CEC commands.  Requires Homebridge 1.3.1 or greater.

## IMPORTANT
This is **very** much a work-in-progress.  Bugs are to be expected.

Javascript and Typescript are not my main languages -- pointers, tips, and input are all welcome!

## Installation
1. This is a plugin for Homebridge, so you'll need to install [homebridge](https://github.com/homebridge/homebridge) if you haven't already.  Be sure to install Node and NPM as well.
2. Install the plugin using NPM: `sudo npm install -g homebridge-cec-tv-control`
    * (Unless in `hb-shell` environment, then type `hb-service add homebridge-cec-tv-control` instead).
3. Install the `cec-utils` package if the `cec-client` command is not present in your terminal: `sudo apt-get install cec-utils`
* Additionally, cec-utils might not be available based on what distribution you're using.  You can also search for libCEC, as that might be packaged and available in your package manager.
* On Raspberry Pi's OSMC image, `cec-cilent` is present at `/usr/osmc/bin/cec-client-4.0.2`, you'll need to run `sudo ln -s /usr/osmc/bin/cec-client-4.0.2 /usr/bin/cec-client` to link it to the default `$PATH` 
4. Add the `TVCECControl` platform to your configuration file.  If you're using [homebridge-ui-x](https://github.com/oznu/homebridge-config-ui-x) you should be able to configure this right in the UI.  Otherwise, you can see an example configuration below.
5. Since this plugin gets registered as an External Accessory in Homebridge, you'll need to register it manually and input your Homebridge authentication code to link it.  More information is output in the Homebridge log when the plugin is loaded.

### Config

```json
platforms": [
    {
        "name": "CEC TV",
        "manufacturer": "TVMaker",
        "model": "Best",
        "serialNumber": "CECTV01",
        "firmwareRevision": "1.0",
        "pollingInterval": 2500,
        "minimizeLogging": false,
        "inputs": [
            {
                "inputNumber": 1,
                "displayName": "Apple TV"
            },
            {
                "inputNumber": 2,
                "displayName": "Raspberry Pi"
            },
            {
                "inputNumber": 3,
                "displayName": "Xbox"
            },
            {
                "inputNumber": 4,
                "displayName": "Playstation"
            }
        ],
        "useActiveSource": true,
        "useInactiveSource": true,
        "useSourceRouting": true,
        "useSetStreamPath": true,
        "platform": "TVCECControl"
    }
]
```
* `name` - The name that you'd like to show up in Homekit.
* `manufacturer` - The manufacturer name that you'd like to show up in the device information in Homekit.
* `model` - The model name that you'd like to show up in the device information in Homekit.
* `serialNumber` - The serial number that you'd like to show up in Homekit. Best to set to prevent errors with duplicate serials. Can be anything, and should be unique.
* `firmwareRevision` - The firmware version that you'd like to show up in Homekit. Can be anything. Default is N/A
* `pollingInterval` - **[Required]** This dictates how often the platform will try to query the HDMI-CEC device for its status.  This helps keep things in sync in Homekit if other devices (remotes, other CEC-enabled devices) change your device status.  This value is in milliseconds, so the default 2500 equates to 2.5 seconds.
* `minimizeLogging` - The plugin periodically logs "informational" data when device status is changed, or polled.  If this is true, those logs will be suppressed.
* `inputs` - A list of the HDMI inputs supported by your device.  Most TVs shouldn't let you switch to unused HDMI inputs (i.e. with nothing plugged in) so you only need to include inputs that are in-use (i.e. with something plugged into them).  
**Note:** It's important to keep your inputs sequential (i.e. include HDMI 1, 2, 3, etc. in that order)
     - `inputNumber` - **[Required]** This is the input source number, i.e. if this is for HDMI 1 this should be 1.
     - `displayName` - **[Required]** This is the name that will be exposed to Homekit (and shown in the input selector for the device).
* `useActiveSource` - Active Source is a command sent to the TV that tries to notify it which input would like to be marked 'active'.  Depending on your TV, this might not work as intended due to the TV refusing Active Source commands issued from other devices. If enabled, an Active Source command will be issued when an input change is requested.
* `useInactiveSource` - Inactive Source is a command sent to the TV that notifies it that the current input is becoming 'inactive'.  Generally this is desired, but for some TVs it might be required to disable this if it causes issues.  If enabled, an Inactive Source command will be issued when an input change is requested.
* `useSourceRouting` - Some TVs adopt the HDMI-CEC specifications in unusual ways.  Source Routing is another way to try and change TV Inputs.  If enabled, Source Routing will be used in addition to any other commands.
* `useSetStreamPath` - Some TVs adopt the HDMI-CEC specifications in unusual ways.  Set Stream Path is another way to try and change TV Inputs.  If enabled, Set Stream Path will be used in addition to any other commands.

## Notes on HDMI Input Switching
HDMI-CEC is complicated, and switching HDMI Inputs seems to vary wildly depending on how manufacturers implement the HDMI-CEC spec.  The Source Routing and Set Stream Path options are great ways to try and "brute force" input switches beyond the default Active Source and Inactive Source commands that the plugin tries first.  Both options can be enabled at the same time, as a delay is inserted before each type of command is used.  However, if input switching *still* doesn't work with both options enabled I'm not aware of any other options.  Sorry!

Additionally, you're in full control of what HDMI-CEC frames (commands) are sent in regards to input switching.  What works well for one TV may not work at all on another one.  The Active Source and Inactive Source commands should generally be the most stable to use, but if you only have two inputs in-use Active Source may cause issues due to the TV automatically switching to the only other available input when Inactive Source is sent.  If your TV flickers between two inputs, disabling Active Source (and possibly Inactive Source) could fix it.

## Device Stop Responding?
The cec-client can sometimes crash, or be given bad information from other devices in the chain leading to an error or segmentation fault.  If this happens, it may lock up, or freeze, causing the TV accessory to become unresponsive.  Restarting the cec-client, or rebooting the host (Raspberry Pi, etc.) should resolve the issue.  This shouldn't happen under normal circumstances, but it's something to be aware of!

*Based on Dominick Han's [homebridge-tv-cec plugin](https://github.com/dominick-han/homebridge-tv-cec)*

*Uses cec-client, which is part of [Pulse-Eight's libCEC](https://github.com/Pulse-Eight/libcec).*
