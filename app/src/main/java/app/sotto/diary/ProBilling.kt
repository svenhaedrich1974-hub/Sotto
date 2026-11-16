package app.sotto.diary

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

/** Einmalkauf "Sotto Pro". Produkt-ID in der Play Console: sotto_pro (verwaltetes Produkt, einmalig). */
class ProBilling(private val act: MainActivity) : PurchasesUpdatedListener {

    companion object {
        const val PRODUCT = "sotto_pro"
    }

    private val prefs = act.getSharedPreferences("pro", 0)
    @Volatile private var details: ProductDetails? = null

    private val client: BillingClient = BillingClient.newBuilder(act)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    fun isPro(): Boolean = prefs.getBoolean("pro", false)

    fun price(): String = details?.oneTimePurchaseOfferDetails?.formattedPrice ?: ""

    fun start() {
        if (client.isReady) {
            loadDetails(); refresh(false); return
        }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    loadDetails()
                    refresh(false)
                }
            }

            override fun onBillingServiceDisconnected() { }
        })
    }

    private fun loadDetails() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(params) { result, list ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                details = list.firstOrNull()
                act.js("window.__sottoPrice && window.__sottoPrice()")
            }
        }
    }

    fun refresh(tell: Boolean) {
        if (!client.isReady) {
            start(); return
        }
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, list ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                handle(list)
                if (tell && !isPro()) act.toast(act.getString(R.string.no_purchase))
            }
        }
    }

    fun buy() {
        val d = details
        if (d == null || !client.isReady) {
            act.toast(act.getString(R.string.store_unavailable))
            start()
            return
        }
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build())
            )
            .build()
        client.launchBillingFlow(act, flow)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) handle(purchases)
    }

    private fun handle(list: List<Purchase>) {
        var owned = false
        for (p in list) {
            if (!p.products.contains(PRODUCT)) continue
            if (p.purchaseState == Purchase.PurchaseState.PURCHASED) {
                owned = true
                if (!p.isAcknowledged) {
                    val ack = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()
                    client.acknowledgePurchase(ack) { }
                }
            }
        }
        if (owned != isPro()) {
            prefs.edit().putBoolean("pro", owned).apply()
            act.js("window.__sottoPro && window.__sottoPro(" + owned + ")")
        }
    }
}
