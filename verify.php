#!/usr/bin/php
<?php

const CODE_SUCCESS = 0;
const CODE_FAILURE = 1;

const AUTHENTICATION_URL = 'http://localhost:4351/';

/**
* Reads credetial file and returns object with username/passsword keys.
* null on failure.
*/
function readCredentialFile($file)
{
	if($f = fopen($file, 'r')) {
		$username = trim(fgets($f));
		$password = trim(fgets($f));
		fclose($f);

		return [
			'username' => $username,
			'password' => $password
		];
	}

	return null;
}

/**
* Sends authorization request to fried-fame-node AuthenticationRelay.
*/
function authenticationRequest(string $username, string $password)
{
	try {
		$payload = json_encode([
			'username' => $username,
			'password' => $password
		]);

		$ch = curl_init(AUTHENTICATION_URL);
		curl_setopt($ch, CURLOPT_POST, 1);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
		curl_setopt($ch, CURLOPT_HTTPHEADER, [
			'Content-Type: application/json',
			'Content-Length: '. strlen($payload)
		]);

		$result = curl_exec($ch);
		$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		curl_close($ch);

		return $statusCode === 200;
	}
	catch(Exception $ex) {
		printf('Internal Error');
		return false;
	}
}

/**
* Project entry point
*/
function main($argv, $argc)
{
	if($argc === 0) {
		printf('Userpass file not found');
		return CODE_FAILURE;
	}

	$credentials = readCredentialFile($argv[0]);
	if(!$credentials) {
		printf('Failed to read credential file');
		return CODE_FAILURE;
	}

	$authenticated = authenticationRequest(
		$credentials['username'],
		$credentials['password']
	);

	if($authenticated) {
		printf('Authenticated successful');
		return CODE_SUCCESS;
	}
	else {
		printf('Authenticated failed');
		return CODE_FAILURE;
	}
}

exit(main(array_slice($argv, 1), $argc - 1));
