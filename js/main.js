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
        user = $("#username").val();
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

    $("#swap").click(async function () {
        $("#swap").attr("disabled", "true");
        $("#loading").removeClass("d-none");
        $("#status").text("Please Wait...");
        await refresh();
        await updateBalance();
        updateSwap(function(canSwap, amount, currency, memo) {
            if (canSwap) {
                $("#swap").attr("disabled", "true");
                $("#loading").addClass("d-none");
                $("#status").text("Confirm the transaction through Hive Keychain.");
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
            } else {
                $("#loading").addClass("d-none");
                $("#status").text("Balance or Liquidity is changed, Please try again.");
            }
        });
    });

    refresh();
});