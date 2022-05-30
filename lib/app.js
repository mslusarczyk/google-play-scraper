'use strict';

const R = require('ramda');
const queryString = require('querystring');
const request = require('./utils/request');
const scriptData = require('./utils/scriptData');
const debug = require('debug')('google-play-scraper');
const cheerio = require('cheerio');
const { BASE_URL } = require('./constants');

const PLAYSTORE_URL = `${BASE_URL}/store/apps/details`;

function app (opts) {
  return new Promise(function (resolve, reject) {
    if (!opts || !opts.appId) {
      throw Error('appId missing');
    }

    opts.lang = opts.lang || 'en';
    opts.country = opts.country || 'us';

    const qs = queryString.stringify({
      id: opts.appId,
      hl: opts.lang,
      gl: opts.country
    });
    const reqUrl = `${PLAYSTORE_URL}?${qs}`;

    const options = Object.assign({
      url: reqUrl,
      followRedirect: true
    }, opts.requestOptions);

    request(options, opts.throttle)
      .then(scriptData.parse)
    // comment next line to get raw data
      .then(scriptData.extractor(MAPPINGS))
      .then(R.assoc('appId', opts.appId))
      .then(R.assoc('url', reqUrl))
      .then(resolve)
      .catch(reject);
  });
}

const MAPPINGS = {
  // FIXME add appId
  title: ['ds:4', 1, 2, 0, 0],
  description: {
    path: ['ds:4', 1, 2, 72, 0, 1],
    fun: descriptionText
  },
  descriptionHTML: ['ds:4', 1, 2, 72, 0, 1],
  summary: ['ds:4', 1, 2, 73, 0, 1],
  installs: ['ds:4', 1, 2, 13, 0],
  minInstalls: ['ds:4', 1, 2, 13, 1],
  maxInstalls: ['ds:4', 1, 2, 13, 2],
  score: ['ds:4', 1, 2, 51, 0, 1],
  scoreText: ['ds:4', 1, 2, 51, 0, 0],
  ratings: ['ds:4', 1, 2, 51, 2, 1],
  reviews: ['ds:4', 1, 2, 51, 3, 1],
  histogram: {
    path: ['ds:4', 1, 2, 51, 1],
    fun: buildHistogram
  },

  price: {
    path: ['ds:4', 1, 2, 57, 0, 0, 0, 0, 1, 0, 0],
    fun: (val) => val / 1000000 || 0
  },
  free: {
    path: ['ds:4', 1, 2, 57, 0, 0, 0, 0, 1, 0, 0],
    // considered free only if price is exactly zero
    fun: (val) => val === 0
  },
  currency: ['ds:4', 1, 2, 57, 0, 0, 0, 0, 1, 0, 1],
  priceText: {
    path: ['ds:4', 1, 2, 57, 0, 0, 0, 0, 1, 0, 2],
    fun: priceText
  },
  // // TODO
  // available: {
  //   path: ['ds:5', 0, 12, 11, 0],
  //   fun: Boolean
  // },
  offersIAP: {
    path: ['ds:4', 1, 2, 19, 0],
    fun: Boolean
  },
  IAPRange: ['ds:4', 1, 2, 19, 0],
  // // TODO
  // size: ['ds:8', 0],
  // // TODO
  // androidVersion: {
  //   path: ['ds:8', 2],
  //   fun: normalizeAndroidVersion
  // },
  // // TODO
  // androidVersionText: ['ds:8', 2],
  developer: ['ds:4', 1, 2, 68, 0],
  developerId: {
    path: ['ds:4', 1, 2, 68, 1, 4, 2],
    fun: (devUrl) => devUrl.split('id=')[1]
  },
  developerEmail: ['ds:4', 1, 2, 69, 1, 0],
  developerWebsite: ['ds:4', 1, 2, 69, 0, 5, 2],
  developerAddress: ['ds:4', 1, 2, 69, 2, 0],
  privacyPolicy: ['ds:4', 1, 2, 99, 0, 5, 2],
  // // TODO
  // developerInternalID: ['ds:5', 0, 12, 5, 0, 0],
  genre: ['ds:4', 1, 2, 79, 0, 0, 0],
  genreId: ['ds:4', 1, 2, 79, 0, 0, 2],
  // // TODO
  // familyGenre: ['ds:5', 0, 12, 13, 1, 0],
  // // TODO
  // familyGenreId: ['ds:5', 0, 12, 13, 1, 2],
  icon: ['ds:4', 1, 2, 95, 0, 3, 2],
  headerImage: ['ds:4', 1, 2, 96, 0, 3, 2],
  screenshots: {
    path: ['ds:4', 1, 2, 78, 0],
    fun: (screenshots) => {
      if (screenshots === null) return [];
      return screenshots.map(R.path([3, 2]));
    }
  },
  video: ['ds:4', 1, 2, 100, 0, 0, 3, 2],
  videoImage: ['ds:4', 1, 2, 100, 1, 0, 3, 2],
  contentRating: ['ds:4', 1, 2, 9, 0],
  contentRatingDescription: ['ds:4', 1, 2, 9, 2, 1],
  adSupported: {
    path: ['ds:4', 1, 2, 48],
    fun: Boolean
  },
  released: ['ds:4', 1, 2, 10, 0],
  updated: {
    path: ['ds:4', 1, 2, 145, 0, 1, 0],
    fun: (ts) => ts * 1000
  },
  version: ['ds:4', 1, 2, 140, 0, 0, 0],
  recentChanges: ['ds:4', 1, 2, 144, 1, 1],
  comments: {
    useServiceRequestId: 'UsvDTd',
    path: ['ds:8', 0],
    fun: extractComments
  }
  // // TODO
  // editorsChoice: {
  //   path: ['ds:5', 0, 12, 15, 0],
  //   fun: Boolean
  // },
  // // TODO
  // features: {
  //   path: ['ds:5', 0, 12, 16],
  //   fun: extractFeatures
  // }
};

// eslint-disable-next-line no-unused-vars
function extractFeatures (featuresArray) {
  if (featuresArray === null) {
    return [];
  }

  const features = featuresArray[2] || [];

  return features.map(feature => ({
    title: feature[0],
    description: R.path([1, 0, 0, 1], feature)
  }));
}

function descriptionText (description) {
  // preserve the line breaks when converting to text
  const html = cheerio.load('<div>' + description.replace(/<br>/g, '\r\n') + '</div>');
  return html('div').text();
}

function priceText (priceText) {
  return priceText || 'Free';
}

// eslint-disable-next-line no-unused-vars
function normalizeAndroidVersion (androidVersionText) {
  const number = androidVersionText.split(' ')[0];
  if (parseFloat(number)) {
    return number;
  }

  return 'VARY';
}

function buildHistogram (container) {
  if (!container) {
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  return {
    1: container[1][1],
    2: container[2][1],
    3: container[3][1],
    4: container[4][1],
    5: container[5][1]
  };
}

/**
 * Extract the comments from google play script array
 * @param {array} comments The comments array
 */
function extractComments (comments) {
  if (!comments) {
    return [];
  }

  debug('comments: %O', comments);

  return R.compose(
    R.take(5),
    R.reject(R.isNil),
    R.pluck(4))(comments);
}

module.exports = app;
