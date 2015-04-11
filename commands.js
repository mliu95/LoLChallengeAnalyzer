var config = require('./config.js'),
	sqlite3 = require('sqlite3').verbose(),
	db = new sqlite3.Database('mydb.db'),
	lolApi = require('leagueapi'),
	moment = require('moment');

// Initialize League API Poller, databases, settings etc.
lolApi.init(config.api_key);
lolApi.setRateLimit(10, 600);

// Takes in all match data on the day (UNIX timestamp) and puts it into the matches table
function generateMatchResults(starttime, endtime) {
	db.run("BEGIN TRANSACTION");
	db.each("SELECT * FROM champ_info", {$starttime: starttime, $endtime: endtime}, function(err, champ_info) {
		if(!err) {
			
		}
	});
	db.run("END");
}

// Generates the correct batch of champions going into the next round. Matches should have already been populated by this point.
function generateBatchKeys() {
	var batch_type = 30,
		batch = null,
		team_1_id = null,
		team_2_id = null,
		key = [];
	// Find batch type to generate keys for
	db.get("SELECT * FROM batch_keys ORDER BY id DESC", function(err, round) {
		if(round) {
			batch_type = Math.ceil(round.batch_round/2);
			batch = JSON.parse(round.batch);
		}
	});
	if(batch_type = 30) {
		// Array of team ids
		batch = [];
	}
	for(var i=0;i<Math.floor(batch.length/2);i++) {
		team_1_id = batch[2*i];
		// If there is a case where a team doesn't have a rival
		if((2*i)+1>batch.length) {
			key.append(team_1_id);
		}
		else {
			team_2_id = batch[(2*i)+1];
			db.get("SELECT * FROM matches WHERE team_1_id=$team_1_id AND team_2_id=$team_2_id", {$team_1_id: team_1_id, $team_2_id: team_2_id}, function(err, match) {
				if(determineWinner(match) == 1) {
					key.append(team_1_id);
				} else {
					key.append(team_2_id);
				}
			});
		}
	}
	// Insert new key into batch_keys table
	db.run("INSERT INTO batch_keys(batch_round, batch) VALUES ($batch_round, $batch)", {$batch_round: batch_type, $batch: key}, function(err, response) {
		if(err) {
			console.log("Error generating batch keys! " + err);
		}
	});
}

// Returns 1 or 2 based on the match data
function determineWinner(match) {
	// TODO
	return match.champion_1_kills > match.champion_2_kills ? 1 : 2;
}

// Loops through every bracket and calculates its score
function generateBatchScores(num, key) {
	var batch;
	db.run("BEGIN TRANSACTION");
	db.each("SELECT $batch,score FROM brackets", {$batch: "batch"+num}, function(err, row) {
		batch = JSON.parse(row["batch"+num]);
		for(var i=0;i<Math.floor(batch.length/2);i++) {
			if(batch[i] == key[i]) {
				score++;
			}
		}
		db.run("UPDATE brackets SET score=$score WHERE id=$id", {
			$score: score,
			$id: row.id
		});
	});
	db.run("END");
}

// Takes matchId and returns a JSON object (1 depth) of data we're interested in (e.g. kills, deaths, CS, etc.)
function storeMatchData(matchId) {
	var stmt;
	lolApi.getMatch(matchId, true, 'na', function(err, response) {
		if(!err) {
			db.run("BEGIN TRANSACTION");
			stmt = db.prepare("INSERT INTO champ_info(champion_id, kills, assists, deaths, win, gold, cs, match_creation) VALUES ($champion_id, $kills, $assists, $deaths, $win, $gold, $cs, $match_creation)");
			for ( participant in response.participants ) {
				db.serialize(function() {
					stmt.run({
						$champion_id: response.participants[participant].championId,
						$kills: response.participants[participant].stats.kills,
						$assists: response.participants[participant].stats.assists,
						$deaths: response.participants[participant].stats.deaths,
						$win: response.participants[participant].stats.winner,
						$gold: response.participants[participant].stats.goldEarned,
						$cs: response.participants[participant].stats.minionsKilled,
						$match_creation: response.matchCreation
					});
				});
			}		
			stmt.finalize();
			db.run("END");
		}
	});
}

// Stores all matches
function storeMatches() {
	db.each("SELECT * from match_dump", function(err, row) {
		if(!err) {
			storeMatchData(row.info);
		}
	})
}
