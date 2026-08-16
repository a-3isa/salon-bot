from telegram import Update
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    CallbackQueryHandler,
    MessageHandler,
    CommandHandler,
    filters,
)
import sheets
from strings import t
from utils.validators import validate_booking_ref

CHECK_REF = 0


def _lang(context) -> str:
    return context.user_data.get("lang", "en")


def _reservation_detail_text(lang: str, reservation: dict, host_phone: str) -> str:
    return t(
        "booking_detail",
        lang,
        service_name=reservation.get("service_name", "N/A"),
        barber_name=reservation.get("barber_name", "N/A"),
        time_preference=reservation.get("time_preference", "N/A"),
        customer_name=reservation.get("customer_name", "N/A"),
        phone=reservation.get("phone", "N/A"),
        booking_ref=reservation.get("booking_ref", "N/A"),
        host_phone=host_phone,
    )


async def start_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    await query.message.reply_text(t("check_ref_prompt", lang))
    return CHECK_REF


async def handle_ref(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    ref  = validate_booking_ref(update.message.text)
    if ref is None:
        await update.message.reply_text(t("check_ref_invalid", lang))
        return CHECK_REF

    try:
        booking = sheets.get_reservation_by_ref(ref)
        if booking is None:
            await update.message.reply_text(t("check_ref_not_found", lang, ref=ref))
            return CHECK_REF

        cfg        = sheets.get_config()
        host_phone = cfg.get("host_phone", "")
        await update.message.reply_text(
            _reservation_detail_text(lang, booking, host_phone),
            parse_mode="Markdown",
        )
        return ConversationHandler.END
    except Exception:
        await update.message.reply_text(t("check_error", lang))
        return CHECK_REF


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    await update.effective_message.reply_text(t("cancelled", lang))
    return ConversationHandler.END


def build_check_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CallbackQueryHandler(start_check, pattern="^check_booking$")],
        states={
            CHECK_REF: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_ref)],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("start",  cancel),
        ],
        allow_reentry=True,
    )
