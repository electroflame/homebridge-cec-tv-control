import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import {EventEmitter} from 'events';
import {spawn} from 'child_process';
const cecClient = spawn('cec-client', ['-d', '8']);
const tvEvent = new EventEmitter();

class CECHelper {
  public static Event_PowerOn = '01:90:00';
  public static Event_PowerStandby = '01:90:01';
  public static Event_PowerRequest = '10:8f';

  //Note: this is a broadcast event that'll turn off the TV and any linked devices.
  public static Event_PowerOffBROADCAST = '0f:36';

  static RequestPowerStatus() {
    this.writeCECCommand(this.Event_PowerRequest);
  }

  static ChangePowerStatusTo(value: boolean) {
    this.writeCECCommand(value ? this.Event_PowerOn : this.Event_PowerStandby);
  }
  
  static writeCECCommand(stringData: string) {
    cecClient.stdin.write('tx ' + stringData + '\n');
  }

  static checkCECCommand(stringData: string) {
    cecClient.stdin.write('tx ' + stringData + '\n');
  }
}

export class CECTVControl implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly cachedAccessories: PlatformAccessory[] = [];

  /**
   * The time (in milliseconds) that we'll wait after completing any tvEvent before finishing them up.
   **/
  EventWaitTimeout = 5000;

  /**
   * The time (in milliseconds) that we'll wait before checking device status for updates.
   **/ 
  UpdatePollDelay = 2500;

  //The tvService that will get initialized below.
  tvService;

  //The device's default name.
  name = 'CEC TV';

  //The platform name.
  platformName = PLATFORM_NAME;

  constructor (public readonly log: Logger, 
                public readonly config: PlatformConfig,
                public readonly api: API) {

    //Load the config values.
    this.loadFromConfig(this.config);

    this.log.info('Initializing TV service');
    
    if(!this.verify()) {

      //Bail out early as something's gone wrong.
      return;
    }
    const tvName = this.config.name || 'CEC TV';
    const UUID = this.api.hap.uuid.generate(PLUGIN_NAME);    
    const tvAccessory = new api.platformAccessory(tvName, UUID);

    tvAccessory.category = this.api.hap.Categories.TELEVISION;

    //Set up the AccessoryInformation Service.
    //There isn't really any information to add right now, but it'll prevent Homekit from displaying "Default" entries.
    tvAccessory.getService(this.Service.AccessoryInformation)
      ?.setCharacteristic(this.Characteristic.Manufacturer, 'N/A')
      .setCharacteristic(this.Characteristic.Model, 'N/A')
      .setCharacteristic(this.Characteristic.SerialNumber, 'N/A')
      .setCharacteristic(this.Characteristic.FirmwareRevision, 'N/A');

    this.tvService = new this.Service.Television(this.name, 'tvService');

    this.tvService.setCharacteristic(this.Characteristic.ConfiguredName, tvName);
    this.tvService.setCharacteristic(this.Characteristic.SleepDiscoveryMode, this.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    //Bind our power status callbacks.
    this.tvService.getCharacteristic(this.Characteristic.Active)
      .on('get', this.getPowerStatus.bind(this))
      .on('set', this.setPowerStatus.bind(this));

    this.log.info('Hooking into cec-client process');
    //Set up a cecClient callback for every time stdout is updated.
    cecClient.stdout.on('data', data => {
      const cecTraffic = data.toString();
      this.log.debug(cecTraffic);

      //Try to detect when CEC-Client changes the OSD name, and change it to something else.
      if (cecTraffic.indexOf('<< 10:47:43:45:43') !== -1) {
        cecClient.stdin.write('tx 10:47:52:50:69\n'); // Set OSD String to 'RPi'
      }

      //If a Power Off Event is written to the buffer...
      if (cecTraffic.indexOf('>> 0f:36') !== -1) {
        tvEvent.emit('POWER_OFF');
      }

      //If a Power On Event is written to the buffer...
      if (cecTraffic.indexOf('>> 01:90:00') !== -1) {
        tvEvent.emit('POWER_ON');
      }

      //If a Power Standby Event is written to the buffer...
      if (cecTraffic.indexOf('>> 01:90:01') !== -1) {
        tvEvent.emit('POWER_STANDBY');
      }

      //If an event that wants to change the current input source is written to the buffer...
      const match = />> (0f:80:\d0:00|0f:86):(\d)0:00/.exec(cecTraffic);
      if (match) {
        tvEvent.emit('INPUT_SWITCHED', match[2]);
      }

    });

    let justSwitched = false;

    tvEvent.on('POWER_ON', () => {
      if (!justSwitched) {
        this.log.debug('CEC: Power on');
        this.tvService.getCharacteristic(this.Characteristic.Active).updateValue(true);
        justSwitched = true;
        setTimeout(() => {
          justSwitched = false;
        }, this.EventWaitTimeout);
      }
    });

    tvEvent.on('POWER_OFF', () => {
      if (!justSwitched) {
        this.log.debug('CEC: Power off');
        this.tvService.getCharacteristic(this.Characteristic.Active).updateValue(false);
        justSwitched = true;
        setTimeout(() => {
          justSwitched = false;
        }, this.EventWaitTimeout);
      }
    });

    tvEvent.on('POWER_STANDBY', () => {
      if (!justSwitched) {
        this.log.debug('CEC: Power standby');

        //Standby is usually the same as off, so false works here.
        this.tvService.getCharacteristic(this.Characteristic.Active).updateValue(false);
        justSwitched = true;
        setTimeout(() => {
          justSwitched = false;
        }, this.EventWaitTimeout);
      }
    });

    tvEvent.on('INPUT_SWITCHED', port => {
      this.log.debug(`CEC: Input switched to HDMI${port}`);
      this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier).updateValue(parseInt(port));
    });

    //Set up an automatic callback to call our pollforUpdates method according to our specified poll delay.
    setInterval(this.pollForUpdates.bind(this), this.UpdatePollDelay);

    this.log.debug('Finished initializing platform:', this.config.name);

    //Add our tvService to our accessory before publishing. 
    tvAccessory.addService(this.tvService);

    //We should be done with everything, publish the service.
    this.api.publishExternalAccessories(PLUGIN_NAME, [tvAccessory]);
  }

  /**
   * This method runs various verification checks to make sure we can proceed with initialization.
   * Returns true if verification passed, and false if it failed.
   */
  verify() {
    let verificationStatus = true;

    if(cecClient === null) {
      this.log.error('CEC-Client was not found.  Is it currently installed?');

      //This is a fatal error, return false to bail out early.
      verificationStatus = false;
    }

    if(!this.config) {
      this.log.error('Could not load from the config.  Was the configuration information added properly?');
    } else {
      //Add a log entry if the plugin is disabled in the config, just in case somebody forgets.
      if(this.config.pluginEnabled === false) {
        this.log.info('This plugin is disabled in its config.  Initialization will not proceed.');

        verificationStatus = false;
      }
    }

    //If verification failed, log an error message.
    if(verificationStatus === false) {
      this.log.error('The service could not be initialized.  More information regarding why should have been logged above.');
    }

    //Return the verificationStatus, which will either let us continue to initialize, or bail out if an error was detected.
    return verificationStatus;
  }

  loadFromConfig(config: PlatformConfig) {
    if(!config) {
      this.log.info('Failed to load information from the Homebridge Config.');
      return;
    }

    this.name = config.name || 'CEC TV';
    this.UpdatePollDelay = config.pollingInterval as number || 2500;
  }

  pollForUpdates() {
    this.log.debug('Requesting CEC Device status');
    CECHelper.RequestPowerStatus();
  }

  getPowerStatus(callback) {
    this.log.info('Checking TV power status');

    CECHelper.RequestPowerStatus();

    callback();
  }

  setPowerStatus(value, callback) {
    this.log.info(`Turning TV ${value ? 'on' : 'off'}`);

    if(value === this.tvService.getCharacteristic(this.Characteristic.Active).value) {
      this.log.info(`TV is already ${value ? 'on' : 'off'}`);
    }

    //Send the on or off signal.
    CECHelper.ChangePowerStatusTo(value);

    callback();
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.cachedAccessories.push(accessory);
  }
}
