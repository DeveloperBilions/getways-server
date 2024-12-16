const axios = require("axios");
const dumpRequest = async (request) => {
	console.log(request);
	var data = {userId: request.user
		, appId: request.appId
		, requestTime: new Date()
		, params: request.params
		, type: request.functionName
		, request: JSON.stringify(request)
	};
	const Resource = Parse.Object.extend("GetwaysAPIRequestDump");
	const object = new Resource();
	var result = await object.save(data, {useMasterKey: true});
	return result
}

const dumpResponse = async (response, id) => {
	console.log(response);
	var data = {requestId: id
		, responseTime: new Date()
		, params: response.params
		, data: response.data
		, response: JSON.stringify(response)
	};
	const Resource = Parse.Object.extend("GetwaysAPIResponseDump");
	const object = new Resource();
	var result = await object.save(data, {useMasterKey: true});
	return result
}
const getTransaction = async (params) => {
	try {
        const response = await axios.get(
            "https://aogglobal.org/AOGCRPT/controllers/api/GetTransaction.php",
            { params }
        )
        // console.log(
        //     `API response for playerId:`,
        //     response.data
        // );
        var res = (({ status, statusText, headers, config, data }) => (
        	{ status, statusText, headers, config, data })
        	)(response);
		return res; 
    } 
    catch (error) {
        console.log(error);
        throw error;
    }
}


const performTransaction = async (params, type) => {
	try{
		console.log(params, type)
		const externalApiUrl = type==="deposit" 
			? "https://aogglobal.org/AOGCRPT/controllers/api/DepositTransaction.php"
			: type==="withdraw" ? "https://aogglobal.org/AOGCRPT/controllers/api/WithdrawTransaction.php" : null;
		const requestParams = {
			playerId: params.playerId,
			orderId: params.orderId,
			amt: parseFloat(params.transactionAmount)
		};
	    const response = await axios.post(externalApiUrl, requestParams, {
	        headers: {
	            "Content-Type": "application/json",
	        },
	    });
	    var res = (({ status, statusText, headers, config, data }) => (
	        	{ status, statusText, headers, config, data })
	    )(response);
		return res;
	} 
	catch (error) {
        console.log(error);
        throw error;
    }
}

Parse.Cloud.define("GetTransaction", async (request) => {
	console.log("GETTRANSACTION CALLED");
	var res = await dumpRequest(request);
	var response = await getTransaction(request.params);
	var res1 = await dumpResponse(response, res.id);
	response = (({ status, statusText, headers, data }) => (
		{ status, statusText, headers, data })
	)(response)
	return response;
});

Parse.Cloud.define("DepositTransaction", async (request) => {
	console.log("DEPOSITTRANSACTION CALLED");
	var res = await dumpRequest(request);
	var response = await performTransaction(request.params, "deposit");
	var res1 = await dumpResponse(response, res.id);
	response = (({ status, statusText, headers, data }) => (
		{ status, statusText, headers, data })
	)(response)
	return response;
});

Parse.Cloud.define("WithdrawTransaction", async (request) => {
	console.log("WITHDRAWTRANSACTION CALLED");
	var res = await dumpRequest(request);
	var response = await performTransaction(request.params, "withdraw");
	var res1 = await dumpResponse(response, res.id)
	response = (({ status, statusText, headers, data }) => (
		{ status, statusText, headers, data })
	)(response)
	return response;
});