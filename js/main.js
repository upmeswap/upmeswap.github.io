$(window).bind("load", function() {
    const ssc = new SSC("https://ha.herpc.dtools.dev");
    var user = null, bal = { HIVE: 0, "SWAP.HIVE": 0, VAULT: 0 }, bridgebal;

    function dec(val) {
        return Math.floor(val * 1000) / 1000;
    }

    async function getBalances (account) {
        const res = await hive.api.getAccountsAsync([account]);
        if (res.length > 0) {
            const res2 = await ssc.find("tokens", "balances", { account, symbol: { "$in": ["SWAP.HIVE", "VAULT"] } }, 1000, 0, []);
            var swaphive = res2.find(el => el.symbol === "SWAP.HIVE");
            var vault = res2.find(el => el.symbol === "VAULT");
            return {
                HIVE: dec(parseFloat(res[0].balance.split(" ")[0])),
                "SWAP.HIVE": dec(parseFloat((swaphive) ? swaphive.balance : 0)),
                VAULT: dec(parseFloat((vault) ? vault.balance : 0))
            }
        } else return { HIVE: 0, "SWAP.HIVE": 0, VAULT: 0 };
    }

    async function refresh () {
        bridgebal = await getBalances("hiveupme");
        $("#hiveliquidity").text(bridgebal.HIVE.toFixed(3));
        $("#swaphiveliquidity").text(bridgebal["SWAP.HIVE"].toFixed(3));

        const total = bridgebal.HIVE + bridgebal["SWAP.HIVE"];
        const stablereq = total * 0.15;
        if (bridgebal.HIVE < stablereq)
        $("#reqhive").text((stablereq - bridgebal.HIVE).toFixed(3));

        if (bridgebal["SWAP.HIVE"] < stablereq)
        $("#reqswaphive").text((stablereq - bridgebal["SWAP.HIVE"]).toFixed(3));

        try {
            if (hive_keychain) {
                $("#txtype").removeAttr("disabled");
                $("#txtype").attr("checked", true);
            }
        }
        catch(e) {
            $("#txtype").attr("disabled", true);
            $("#txtype").removeAttr("checked");
        }

        $("input[name=txtype]").change();

    };

    $("#refresh").click(async function () {
        $(this).attr("disabled", true);
        await refresh();
        $(this).removeAttr("disabled");
    });

    function updateSwap(r) {
        try {
            const insymbol = $("#input").val();
            var outsymbol = $("#output").val();
            const val = $("#inputquantity").val();
            const fee = (insymbol === "VAULT") ? 0 : Math.ceil((val * 0.001) * 1000) / 1000;
            $("#fee").text(fee.toFixed(3));
            $("#feeticker").text(insymbol);
            const output = (insymbol === "VAULT") ? (val/10) : (val - fee);
            $("#outputquantity").val(output.toFixed(3));

            if (insymbol === outsymbol) {
                var othersymbol;
                $("#output option").each(function () {
                    if ($(this).val() !== insymbol) {
                        othersymbol =  $(this).val();
                        return
                    }
                });
                outsymbol = othersymbol;
                $("#output").val(othersymbol);
            }

            if (bridgebal[outsymbol] >= output
                && bal[insymbol] >= val
                && insymbol !== outsymbol
                && val >= 1) {
                $("#swap").removeAttr("disabled");
                if (r) r(true, parseFloat(val).toFixed(3), insymbol, `Swapping to ${(outsymbol === 'SWAP.HIVE') ? 'Swap.Hive' : 'Hive'}`);

            } else { 
                $("#swap").attr("disabled", "true");
                if (r) r(false);
            }
        } catch (e) {}
    }

    var modal = new bootstrap.Modal(document.getElementById('authqr'), {
        focus: true,
        backdrop: 'static',
    });

    $(".s").click(function () {
        $("#input").val($(this).find(".sym").text());
        $("#inputquantity").val($(this).find(".qt").text());
        updateSwap();
    });

    $("#inputquantity").keyup(() => { updateSwap(); });
    $("#input, #output").change(() => { updateSwap(); });

    $("#reverse").click(function () {
        var input = $("#input").val();
        $("#input").val($("#output").val());
        $("#output").val(input);
        updateSwap();
    });

    async function updateBalance() {
        bal = await getBalances(user);

        $("#hive").text(bal.HIVE.toFixed(3));
        $("#swaphive").text(bal["SWAP.HIVE"].toFixed(3));
        $("#vault").text(bal.VAULT.toFixed(3));
    }

    $("#checkbalance").click(async function() {
        user = $.trim($("#username").val().toLowerCase());
        if (user.length >= 3) {
            $(this).attr("disabled", "true");
            await updateBalance();
            updateSwap();
            $(this).removeAttr("disabled");
            localStorage['user'] = user;
        }
    });

    if (localStorage['user']) {
        $("#username").val(localStorage['user']);
        user = localStorage['user'];
        updateBalance();
    }

    // HAS implementation
    const HAS_SERVER = "wss://hive-auth.arcange.eu";
    const HAS_APP_DATA = {
        name:"UPMESWAP",
        description:"Discounted Bridge",
        icon:"https://upmeswap.github.io/assets/hiveupme.png",
    };
    const app_key = uuidv4();
    var token
    var expire
    var auth_key
    var ws = undefined;
    if ("WebSocket" in window) {
        $("#txtype1").removeAttr("disabled");
        if ($("#txtype").attr("checked") !== "true") {
            $("#txtype").removeAttr("checked");
            $("#txtype1").attr("checked", true);
        }
        $("input[name=txtype]").change();
        ws = new WebSocket(HAS_SERVER)
        ws.onopen = function() {
            console.log("Connection Established");
            // Web Socket is connected
        }        
    } else {
        $("#txtype1").attr("disabled", true);
        $("#txtype1").removeAttr("checked");
    }

    function isTimeAvailable(ex) {
        const timestamp = new Date().getTime();
        if (ex > timestamp)
            return true;
        else 
            return false;
    }

    $("#swap").click(async function () {
        $("#swap").attr("disabled", "true");
        $("#loading").removeClass("d-none");
        $("#status").text("Please Wait...");
        await refresh();
        await updateBalance();
        updateSwap(function(canSwap, amount, currency, memo) {
            if (canSwap) {
                const txtype = $("input[type='radio'][name='txtype']:checked").val();
                
                $("#swap").attr("disabled", "true");
                $("#loading").addClass("d-none");
                $("#status").text(`Confirm the transaction through ${txtype}.`);

                if (txtype === "Hive Keychain") {
                    if (currency !== "HIVE") {
                        hive_keychain.requestSendToken(
                            user,
                            "hiveupme",
                            amount,
                            memo,
                            currency,
                            async function (res) {
                                if (res.success === true) {
                                    $("#status").text("Swaping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    await updateBalance();
                                    updateSwap();
                                } else {
                                    $("#status").text("Transaction failed, Please try again.");
                                    updateSwap();
                                }
                                console.log(res);
                            }
                        );
                    } else {
                        hive_keychain.requestTransfer(
                            user,
                            "hiveupme",
                            amount,
                            memo,
                            currency,
                            async function (res) {
                                if (res.success === true) {
                                    $("#status").text("Swaping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    await updateBalance();
                                    updateSwap();
                                } else {
                                    $("#status").text("Transaction failed, Please try again.");
                                    updateSwap();
                                }
                                console.log(res);
                            }
                        );
                    }
                } else if (txtype === "Hive Auth") {
                    ws.onmessage = function (event) {
                        const message = typeof(event.data)=="string" ? JSON.parse(event.data) : event.data;
                        if(message.cmd) {
                            switch(message.cmd) {
                                case "auth_wait":
                                    // Update QRCode
                                    const json = JSON.stringify({
                                        account: user, 
                                        uuid: message.uuid,
                                        key: auth_key,
                                        host: HAS_SERVER});
            
                                    const URI =  `has://auth_req/${btoa(json)}`
                                    var url = "https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=" + URI;
                                    $("#qr-code").attr("src", url);
                                    $("#qr-link").attr("href", URI);
                                    $("#qr-div").addClass("d-flex");
                                    $("#qr-div").removeClass("d-none");
                                    $("#approve-div").addClass("d-none");
                                    $("#approve-div").removeClass("d-flex");  

                                    modal.show();
                                    break
                                case "auth_ack":
                                    try {
                                        // Try to decrypt and parse payload data
                                        message.data = JSON.parse(CryptoJS.AES.decrypt(message.data, auth_key).toString(CryptoJS.enc.Utf8))
                                        token = message.data.token
                                        expire = message.data.expire
                                        localStorage['token'] = token;
                                        localStorage['expire'] = expire;
                                        localStorage['auth_key'] = auth_key;

                                        $("#qr-div").removeClass("d-flex");
                                        $("#qr-div").addClass("d-none");
                                        $("#approve-div").addClass("d-flex");
                                        $("#approve-div").removeClass("d-none");
                                        modal.show();

                                        $("#approve").click(function() {
                                            modal.hide();
                                            const json = JSON.stringify({
                                                "contractName": "tokens",
                                                "contractAction": "transfer",
                                                "contractPayload": {
                                                    "symbol": currency,
                                                    "to": "hiveupme",
                                                    "quantity": amount,
                                                    "memo": memo
                                                }
                                            });                       
                                            if (currency !== "HIVE") {
                                                const op = [
                                                    "custom_json",
                                                    {
                                                        id: "ssc-mainnet-hive",
                                                        json: json,
                                                        required_auths: [user],
                                                        required_posting_auths: [],
                                                    }
                                                ]
                                                const sign_data = {
                                                    key_type: "active",
                                                    ops: [op],
                                                    broadcast: true
                                                };
                                                const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data),auth_key).toString();
                                                const payload = { cmd:"sign_req", account:user, token:token, data:data };
                                                ws.send(JSON.stringify(payload));
                                            } else {
                                                const op = [
                                                    "transfer",
                                                    {
                                                        from: user,
                                                        to: 'hiveupme',
                                                        amount: `${amount} HIVE`,
                                                        memo,
                                                    }
                                                ]
                                                const sign_data = {
                                                    key_type: "active",
                                                    ops: [op],
                                                    broadcast: true
                                                };
                                                const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data),auth_key).toString();
                                                const payload = { cmd:"sign_req", account:user, token:token, data:data };
                                                ws.send(JSON.stringify(payload));
                                            }
                                        });                                 
                                    } catch(e) {
                                        // Decryption failed - ignore message
                                        modal.hide();
                                        console.error("decryption failed",e.message)
                                        $("#loading").addClass("d-none");
                                        $("#status").text("Failed to Establish connection with HAS. Try Again!");
                                        updateSwap();
                                    }
                                    break
                                case "auth_nack":
                                    modal.hide();
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Failed to Establish connection with HAS. Try Again!");
                                    updateSwap();
                                    break;
                                case "sign_wait":
                                    $("#loading").removeClass("d-none");
                                    $("#status").text("Waiting for approval from Hive Auth App.");
                                    break
                                case "sign_ack":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Swaping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    updateSwap();
                                    break
                                case "sign_nack":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Transaction was declined through HiveAuth.");
                                    updateSwap();
                                    break
                                case "sign_err":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Transaction was unsuccessfull through HiveAuth.");
                                    updateSwap();
                                    break
                            }
                        }
                    }

                    const auth_data = {
                        app: HAS_APP_DATA,
                        token: undefined,
                        challenge: undefined
                    };

                    auth_key = uuidv4();

                    if (localStorage['token']
                        && localStorage['auth_key']
                        && isTimeAvailable(localStorage['expire'])) {
                        token = localStorage['token'];
                        auth_key = localStorage['auth_key'];
                        auth_data.token = token;
                    }
        
                    const data = CryptoJS.AES.encrypt(JSON.stringify(auth_data),auth_key).toString();
                    const payload = { cmd:"auth_req", account:user, data:data, token:token};
                    ws.send(JSON.stringify(payload));
                } else {
                    $("#loading").addClass("d-none");
                    $("#status").text("No method of transaction available.");
                    updateSwap();
                }
            } else {
                $("#loading").addClass("d-none");
                $("#status").text("Balance or Liquidity is changed, Please try again.");
            }
        });
    });

    $("input[name=txtype]").change(function() {
        const el = $("input[type='radio'][name='txtype']");
        el.each(function () {
            if ($(this).prop("checked") == true) {
                $(this).parent("div").addClass("bg-primary");
            } else {
                $(this).parent("div").removeClass("bg-primary");
            }
        });
    });

    refresh();
});