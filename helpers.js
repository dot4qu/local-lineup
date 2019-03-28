var request = require('async-request');
var formUrlEncode = require('form-urlencoded').default;


function requestError(response, exception = null) {
	console.log('REQUEST ERROR');
	if (response) {
		console.log(`RESPONSE STATUS CODE: ${response.statusCode}`);
		console.log(response.body);
	}

	if (exception) {
		console.log(exception);
	}

	return response;
}

async function instrumentCall(url, options, logCurl) {
	let res;
	let error = null;

	// Default value of true
	logCurl = logCurl === undefined ? true : logCurl;
	try {
		res = await request(url, options);
	} catch (e) {
		error = requestError(res, e);
	} finally {
		// Log out a curl for every call we instrument.
		if (logCurl && process.env.DEPLOY_STAGE !== 'PROD') {
			let curl = ['curl'];

			// -s: don't show progress ascii
			// -D -: output headers to file, '-' uses stdout as file
			// You can also use -v for a full dump
			curl.push('-sD -');
			curl.push(`\'${url}\'`);
			curl.push(`-X ${options.method}`);
			for (let header of Object.keys(options.headers)) {
				curl.push(`-H \'${header}: ${options.headers[header]}\'`);
			}

			if (options.data) {
				let encodedData;
				switch (options.headers['Content-type']) {
					case 'application/json':
						encodedData = JSON.stringify(options.data);
						break;
					case 'application/x-www-form-urlencoded':
						encodedData = formUrlEncode(options.data);
						break;
					default:
						throw new Error(`Need to supply a data encoded for ${JSON.stringify(options.data, null, 2)} in curl logging`);
				}

				curl.push(`-d \'${encodedData}\'`);
			}

			curl.push('--compressed');
			console.log(curl.join(' '));
		}
	}

	if (res && res.statusCode >= 400) {
		error = requestError(res);
	}

	let success = error === null;
	let response = error || res;
	return { success, response };
}

// Compare dates agnostic of times
function datesEqual(dateString1, dateString2) {
	// The date will come as ms since epoch from foopee scrape but a datetime string from the other two
	let date1 = new Date(dateString1);
	let date2 = new Date(dateString2);
	return date1.getUTCFullYear() === date2.getUTCFullYear()
		&& date1.getUTCMonth() === date2.getUTCMonth()
		&& date1.getUTCDate() === date2.getUTCDate();
}

function getUTCDate(inputDate) {
	let date = new Date(inputDate);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0);
}

function addDedupedShows(previouslyAddedShows, newArtistShowList)
{
	// If you set this to previouslyAddedShows directly does js do a shallow copy or are we dealing with pointers?
	let dedupedShows = [].concat(previouslyAddedShows);
	for (i in newArtistShowList) {
		let dupeDate = false;
		for (j in previouslyAddedShows) {
			if (datesEqual(newArtistShowList[i].date, previouslyAddedShows[j].date)) {
				dupeDate = true;
				break;
			}
		}

		if (!dupeDate) {
			dedupedShows.push(newArtistShowList[i]);
		}
	}

	return dedupedShows;
}

// adapted from perf solution of this answer https://stackoverflow.com/a/9229821.
// Does not remove shows in-place from list but reassigns new list after deduping
function dedupeShows(showsByArtistId) {
	for (let key of Object.keys(showsByArtistId)) {
		let showList =  showsByArtistId[key];
		let dedupedShowList = [];

		// 'set' used for hash lookups on dates to dedupe
		let dates = {};
		for (showObj of showList) {
			let standardDate = getUTCDate(showObj.date);
			if (dates[standardDate] !== 1) {
				dates[standardDate] = 1;
				dedupedShowList.push(showObj);
			}
		}

		showsByArtistId[key] = dedupedShowList;
	}
}

module.exports = {
	instrumentCall,
	datesEqual,
	dedupeShows
};