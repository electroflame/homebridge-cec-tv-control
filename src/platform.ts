import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import {Timekeeper} from './promises';

import {EventEmitter} from 'events';
import {spawn} from 'child_process';
const cecClient = spawn('cec-client', ['-d', '8']);
const tvEvent = new EventEmitter();

class CECHelper {

  //Note: These codes were worked out via CEC-O-Matic (cec-o-matic.com).
  //      The last line of each comment represents how the CEC Frame is formulated.
  //      They represent which source device goes to which destination (i.e. TV -> Recording 1),
  //      and which event type is represented (i.e. Report Power Status).

  /**
   * The CEC frame that's returned/reported when a device's power status is ON.
   * TV -> Recording 1 | Report Power Status: On
   */
  public static Event_PowerOn = '01:90:00';

  /**
   * The CEC frame that's returned/reported when a device's power status is STANDBY.
   * TV -> Recording 1 | Report Power Status: Standby
   */
  public static Event_PowerStandby = '01:90:01';

  /**
   * The CEC frame for requesting a device's power status.
   * Recording 1 -> TV | Give Device Power Status
   */
  public static Event_PowerRequest = '10:8f';

  /**
   * The CEC frame for turning the device on (switching to Active state.)
   * Recording 1 -> TV | Image View On
   */
  public static Event_TurnPowerOn = '10:04';

  /**
   * The CEC frame for turning the device off/putting it in standby (switching to Standby state.)
   * Recording 1 -> TV | Standby
   */
  public static Event_TurnPowerStandby = '10:36';

  /**
   * The CEC frame for turning the device off/putting it in standby (switching to Standby state.)
   * This is a broadcast event that should turn everything off in the HDMI device chain.
   * TV -> Broadcast | Standby
   */
  public static Event_TurnPowerOffBROADCAST = '0f:36';

  /**
   * The CEC frame for requesting the current status of the system/source device.
   * TV -> Broadcast | Request Active Source
   */
  public static Event_ActiveSourceRequest = '0f:85';

  /**
   * The CEC frame for indicating that this source would like to become the active source.
   * Note: This is NOT usable directly, as it requires having the X character replaced with the desired input value.
   * Recording 1 -> Broadcast | Active Source
   */
  public static Event_ChangeActiveSource = '1f:82:X0:00';

  /**
   * The CEC frame for indicating that the current source would like to become an inactive source.
   * Note: This is NOT usable directly, as it requires having the X character replaced with the desired input value.
   * Recording 1 -> Broadcast | Inactive Source
   */
  public static Event_MarkCurrentSourceInactive = '1f:9D:X0:00';

  /**
   * The CEC frame for indicating that the active route has changed.
   * Note: This is NOT usable directly, as it requires having the X AND Y characters replaced with the original and destination addresses.
   * Recording 1 -> TV | Routing Change
   */
  public static Event_SourceRouteChange = '10:80:X0:00:Y0:00';

  /**
   * The CEC frame for indicating that we'd like to request a streaming path change to the specified address.
   * Note: This is NOT usable directly, as it requires having the X character replaced with the desired input value.
   * Recording 1 -> TV | Set Stream Path
   */
  public static Event_SetStreamPath = '10:86:X0:00';

  static RequestPowerStatus() {
    this.writeCECCommand(this.Event_PowerRequest);
  }

  static RequestActiveSource() {
    this.writeCECCommand(this.Event_ActiveSourceRequest);
  }

  static ChangePowerStatusTo(value: boolean) {
    this.writeCECCommand(value ? this.Event_TurnPowerOn : this.Event_TurnPowerStandby);
  }

  /**
   * Sends a CEC frame requesting that the Active Source be changed to the source specified.
   * @param value A number representing the input source we'd like to change to.
   */
  static async ChangeInputTo(value: number, currentValue: number) {
    
    //Store our frame string here so we can operate on it below.
    let frame = this.Event_ChangeActiveSource;

    let inactiveFrame = this.Event_MarkCurrentSourceInactive;

    //Replace the X in our frame string with the proper input value.
    //Basically splitting the string on our X, and then joining the two halves together by inserting our value.
    frame = frame.split('X').join(String(value));

    //Do the same thing for our inactiveFrame, just using the currentValue.
    inactiveFrame = inactiveFrame.split('X').join(String(currentValue));

    //Mark our desired source as active first.
    this.writeCECCommand(frame);

    //Wait 50ms before sending the next command.
    await Timekeeper.WaitForMilliseconds(50);
    
    //Mark the current source as inactive.
    this.writeCECCommand(inactiveFrame);

    //Additionally, because some devices are stubborn, we should send out Routing Change and Set Stream Path frames, too.

    //Wait 50ms before sending the next command.
    await Timekeeper.WaitForMilliseconds(50);

    this.sourceRoutingChange(value, currentValue);

    //Wait 50ms before sending the next command.
    await Timekeeper.WaitForMilliseconds(50);

    this.setStreamPath(value);
  }

  /**
   * Sends a CEC frame requesting a Routing Change from the current address to a new address.
   * @param newValue A number representing the source we'd like to change to.
   * @param currentValue A number representing the source we're currently using.
   */
  private static async sourceRoutingChange(newValue: number, currentValue: number) {
    
    //Store our frame string here so we can operate on it below.
    let frame = this.Event_SourceRouteChange;

    //Replace the X in our frame string with the proper input value.
    //Basically splitting the string on our X, and then joining the two halves together by inserting our value.
    frame = frame.split('X').join(String(currentValue));

    //Replace the Y in our frame string with the proper input value.
    frame = frame.split('Y').join(String(newValue));

    //Write out the newly-formed frame.
    this.writeCECCommand(frame);
  }

  /**
   * Sends a CEC frame requesting a Set Stream Path to a new address.
   * @param value A number representing the source we'd like to change to.
   */
  private static async setStreamPath(value: number) {
    
    //Store our frame string here so we can operate on it below.
    let frame = this.Event_SetStreamPath;

    //Replace the X in our frame string with the proper input value.
    //Basically splitting the string on our X, and then joining the two halves together by inserting our value.
    frame = frame.split('X').join(String(value));

    //Write out the newly-formed frame.
    this.writeCECCommand(frame);
  }
  
  /**
   * Writes the specified stringData out to the CEC-Client.  This handles formatting it with 'tx' and finishing it with the '\n' newline.
   * @param stringData The CEC frame string that should be written out by the CEC-Client.
   */
  private static writeCECCommand(stringData: string) {
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

  //The array of HDMI inputs.
  inputs;

  /**
   * The current input value/port number for the active source.
   */
  currentInputValue = 0;

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

      //This is basically checking two separate CEC frames: Routing Change, and Set Stream Path.
      //The first frame is a long one, e.g. 0f:80:X0:00:Y0:00, which specifies that the device is changing from source X to source Y.
      //The second frame is shorter, e.g. 0f:86:X0:00, which basically specifies that the device is requesting a change to source X.
      //Depending on how the device implements the CEC spec, it could send either of these frames back, so it's best to check for both.
      const inputSwitchMatch = />> (0f:80:\d0:00|0f:86):(\d)0:00/.exec(cecTraffic);
      if (inputSwitchMatch) {
        tvEvent.emit('INPUT_SWITCHED', inputSwitchMatch[2]);
      }

      const inputRequestMatch = />> 0f:82:\d0:00/.exec(cecTraffic);
      if (inputRequestMatch) {
        tvEvent.emit('INPUT_REQUEST', inputRequestMatch[2]);
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
      this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier).updateValue(this.verifyPortIsValid(port));
      this.currentInputValue = port;
    });

    tvEvent.on('INPUT_REQUEST', port => {
      this.log.debug(`CEC: Input is HDMI${port}`);
      this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier).updateValue(this.verifyPortIsValid(port));
      this.currentInputValue = port;
    });

    //Set up an automatic callback to call our pollforUpdates method according to our specified poll delay.
    setInterval(this.pollForUpdates.bind(this), this.UpdatePollDelay);

    //Set up our input sources before we're done.
    this.setupInputSources(tvAccessory);
    
    this.log.debug('Finished initializing platform:', this.config.name);

    //Add our tvService to our accessory before publishing. 
    tvAccessory.addService(this.tvService);

    //We should be done with everything, publish the service.
    this.api.publishExternalAccessories(PLUGIN_NAME, [tvAccessory]);
  }

  /**
   * Verifies that a given port number is a valid number.
   * 
   * @param port The port that needs to be verified.
   * @returns A the port number (that is guaranteed to not be NaN or out-of-bounds), or zero if it couldn't be verified.
   */
  verifyPortIsValid(port): number {
    //Convert port to a number first.
    const numberedPort = Number(port);

    let foundError = false;

    //Try to catch some common issues and set the numberedPort to zero if we encounter a problem.

    if(isNaN(numberedPort)) {
      this.log.debug('Something went wrong fetching the source input port number(s) (port was NaN).  Input/Source switching may not work.');
      foundError = true;
    }

    if(numberedPort < 0) {
      this.log.debug(`The source input port number was out-of-bounds (${numberedPort}).  Input/Source switching may not work.`);
      foundError = true;
    }
    
    //We're done, if we found an error return zero, other return our port.
    return (foundError) ? 0 : numberedPort;
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

    //Check if our inputs array is valid.
    if(this.inputs === null || this.inputs === undefined || this.inputs.length <= 0) {
      this.log.error('Could not load input sources from config.  Do you have at least one HDMI input source defined in your config?');

      verificationStatus = false;
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
    this.inputs = config.inputs;

    //Double-check that the input array is actually set up as an array.
    //If it's not, try and cast it to an array here.
    if(Array.isArray(this.inputs) === false) {
      this.inputs = [this.inputs];
    }
  }

  pollForUpdates() {
    this.log.debug('Requesting CEC Device status');
    CECHelper.RequestPowerStatus();
    CECHelper.RequestActiveSource();
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

  setupInputSources(tvAccessory: PlatformAccessory) {
    this.inputs.forEach((value, i) => {

      //Set up some variables to hold the input data from the config.
      const inputID = value.inputNumber as number;
      const inputName = value.displayName as string;
    
      const input = new this.Service.InputSource('' + inputID, 'inputSource' + i);
      
      input
        .setCharacteristic(this.Characteristic.Identifier, inputID)
        .setCharacteristic(this.Characteristic.ConfiguredName, inputName)
        .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(this.Characteristic.CurrentVisibilityState, this.Characteristic.CurrentVisibilityState.SHOWN);

      this.log.debug('Adding input source with inputID of ' + inputID + ' and displayName of ' + inputName + '.');

      tvAccessory.addService(input);
      this.tvService.addLinkedService(input);
    });

    this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier)
      .on('get', this.getInputStatus.bind(this))
      .on('set', this.setInputStatus.bind(this));
  }

  getInputStatus(callback) {
    this.log.info('Checking TV active source status');

    CECHelper.RequestActiveSource();

    callback();
  }

  setInputStatus(value : number, callback) {

    //Note: we use value - 1 here to convert our value to zero-based for array indexing.
    const index = value - 1;

    //Try to check that our input value is within sane limits, and bail out if its not.
    if(index < 0 || index > this.inputs.length) {
      this.log.error('Could not change TV active source, desired input value was out-of-bounds.' 
                      + ' (index = ' + index + '| array length = ' + this.inputs.length + ')');
      return;
    }

    const desiredInput = this.inputs[index];

    this.log.info('Changing TV active source to ' + desiredInput.displayName + ' (Source ' + desiredInput.inputNumber + ')');
    this.log.debug('Given value is ' + value);

    //Send the Active Source signal.
    CECHelper.ChangeInputTo(value, this.currentInputValue);

    //Set the currentInputValue to our value, as it will be the new current value.
    this.currentInputValue = value;

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
