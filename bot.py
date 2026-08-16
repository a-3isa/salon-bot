import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler
import config
from strings import t
from handlers.booking import build_booking_handler
from handlers.check_booking import build_check_handler
from handlers import admin

logging.basicConfig(
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
    level=logging.INFO,
)


def _main_menu_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t("btn_new_booking",   lang), callback_data="new_booking")],
        [InlineKeyboardButton(t("btn_check_booking", lang), callback_data="check_booking")],
    ])


async def start(update: Update, context) -> None:
    """Show language picker. If user already has a language, show main menu directly."""
    lang = context.user_data.get("lang")
    if lang:
        await update.effective_message.reply_text(
            t("main_menu", lang), reply_markup=_main_menu_keyboard(lang)
        )
        return
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(t("lang_btn_en", "en"), callback_data="lang_en"),
        InlineKeyboardButton(t("lang_btn_ar", "ar"), callback_data="lang_ar"),
    ]])
    await update.effective_message.reply_text(
        "🌐 Choose your language / اختر لغتك:",
        reply_markup=keyboard,
    )


async def handle_language(update: Update, context) -> None:
    """Store chosen language and show main menu."""
    query = update.callback_query
    await query.answer()
    lang = "ar" if query.data == "lang_ar" else "en"
    context.user_data["lang"] = lang
    await query.message.reply_text(
        t("main_menu", lang), reply_markup=_main_menu_keyboard(lang)
    )


def main() -> None:
    app = Application.builder().token(config.BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    # Language selection is global — handled before ConversationHandlers
    app.add_handler(CallbackQueryHandler(handle_language, pattern="^lang_(en|ar)$"), group=0)
    app.add_handler(build_booking_handler(),  group=1)
    app.add_handler(build_check_handler(),    group=1)
    app.add_handler(CommandHandler("add_service",            admin.add_service))
    app.add_handler(CommandHandler("remove_service",         admin.remove_service))
    app.add_handler(CommandHandler("set_service_available",  admin.set_service_available))
    app.add_handler(CommandHandler("set_service_unavailable", admin.set_service_unavailable))
    app.add_handler(CommandHandler("list_services",          admin.list_services))
    app.add_handler(CommandHandler("add_barber",             admin.add_barber))
    app.add_handler(CommandHandler("remove_barber",          admin.remove_barber))
    app.add_handler(CommandHandler("set_barber_available",   admin.set_barber_available))
    app.add_handler(CommandHandler("set_barber_unavailable", admin.set_barber_unavailable))
    app.add_handler(CommandHandler("list_barbers",           admin.list_barbers))

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    import asyncio
    asyncio.set_event_loop(asyncio.new_event_loop())
    main()
