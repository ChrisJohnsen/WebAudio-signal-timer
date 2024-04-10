# WebAudio Periodic Signal Timer

This project is published on GitHub Pages. Go [there][ghp] if you just want to try it out. Trial versions might occasionally be published [here][pu].

[ghp]: https://chrisjohnsen.github.io/WebAudio-signal-timer/
[pu]: https://chrisjohnsen.github.io/WebAudio-signal-timer/pu

## What is this?

If you have an audio signal that you expect to have a mostly consistent (but possibly unknown) duration & period that you can feed to a device's audio input, this offline-usable web app can help automatically time the period and duration and predict when the signal will next start/stop.

### Details

This app...

- is usable offline.

  It uses a service worker to cache its code. Just navigate back to the app's URL (e.g. from a bookmark) to use it without having to be connected to a data network. It is not a full installable PWA, but that might be a possible future enhancement.

- has a fixed sampling period of 100ms.

  If your signal's period or duration is too short, this app may not work without being modified to use faster sampling. The spectrums and signal detection happen only at a longer "reporting" period (minimum of 200ms) that is configurable in the UI. The signal information produced at each reporting interval is aggregated from the 100ms internal samples.

- uses a "in-band/out-of-band" detector.

  The band is configurable and detections are based on how much higher the average "in-band" signal is than the average "out-of-band" signal. A demo audio source shows how a clear-enough signal can be detected even with consistent noise across the whole spectrum.

- bases its estimated timings on the average of the values inside the inter-quartile range (IQR) of the detected signal event times.

  Events with time values outside the IQR are trimmed out of the averages. If "expected" values are supplied, they are added to the average until the app has 8 measured values (4 will survive the IQR truncation to provide the actual estimated value).

- will automatically assume it "missed" one or more signals if it sees a period that is nearly a multiple of the estimated period.

  If a signal is missed immediately after the first signal this could prevent the actual period from being calculated unless enough single-period events occur to push that initial multiple-period value out into the outlier range. Supplying an expected period can help prevent this possibility.

## Rough Edges

- This app is very ugly. Almost no consideration has gone into making it look or work nicely. It is a proof-of-concept.

- The interval sampling rate is fixed at 100ms.

  This is how often we ask for an FFT of the recent audio data. Probably most devices could handle a shorter polling interval, but my use case shouldn't really need it.

- The app does not try to keep the device awake.

  I haven't even looked at whether it is possible for a web page that isn't playing video to keep a device active. It is probably best to temporarily disable "sleep" while the app collects its data.

- The spectrogram is cleared when the web pages resizes (including orientation changes on mobile devices).

  The app does not currently keep the historical data needed to redraw the spectrogram at a different resolution (and also doesn't try to resample the previous image data at the new resolution).

- The spectrogram's time axis is not labeled.

  Technically, this axis is not constant since the user can change the reporting period (one pixel row is drawn per report).

## Possible Future Stuff

- Automatic (and manual) light/dark color schemes.

- Alternate detector configuration.

  "Natural" frequency bands are probably log-like and they are awkward as "center & width". For example, a voice-like range might be 300-3000Hz, which is centered at 1650Hz with a 2700Hz width. This doesn't bear much resemblance to the range.

  So either a "start & end" configuration or a "start & power of 10 width" might be nicer.

- If the detector can't be tuned to reject enough false positives it might be nice to have a way to let the user flag certain detections to be ignored.

- If a signal is too variable for the detector, it might be nice to be able to record, playback and download the audio data to aid in devising and implementing a new variation of the detector.

- A more-full PWA implementation might be nice.

  It could be "installable" an an app.

## Development

This project is built by [Vite][vite] and uses the [Vue][vue] JavaScript UI framework. The original [Vite README][viteme] provides a brief description of the IDE configuration and the basic CLI commands.

[vite]: https://vitejs.dev/
[vue]: https://vuejs.org/
[viteme]: README-Vite.md

### Development Commands

    pnpm install      # install dependencies

    pnpm format       # prettier, VSCode can be configured to do this automatically
    pnpm type-check   # vue-tsc to run TypeScript's tsc in --noEmit mode
    pnpm lint         # ESLint
    pnpm test:unit    # Vitest; watch-mode testing

    pnpm dev          # watch-mode development server with HMR
    pnpm build        # production build to dist/
    pnpm preview      # serve dist/

    pnpm audit        # check for deps that should be updated

### Published on GitHub Pages

A GitHub Actions [workflow][pages wf] automatically builds this project and deploys it to GitHub pages when the `main` branch is pushed. Other branches might also be occasionally published in subdirectories; check the workflow definition.

[pages wf]: .github/workflows/pages.yml
