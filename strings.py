"""All user-facing strings in English and Arabic."""

_CONFIRM_SUMMARY = (
    "*Please review your reservation:*\n\n"
    "Service: {service_name}\n"
    "Barber: {barber_name}\n"
    "Preferred time: {time_preference}\n"
    "Customer: {customer_name}\n"
    "Phone: {phone}"
)

_BOOKING_DETAIL = (
    "*Your Reservation*\n\n"
    "Service: {service_name}\n"
    "Barber: {barber_name}\n"
    "Preferred time: {time_preference}\n"
    "Customer: {customer_name}\n"
    "Phone: {phone}\n"
    "Ref: {booking_ref}\n"
    "Salon phone: {host_phone}"
)

_COMMON = {
    "choose_lang": "Choose your language:",
    "lang_btn_en": "English",
    "lang_btn_ar": "Arabic",
    "main_menu": "Welcome! What would you like to do?",
    "btn_new_booking": "New Reservation",
    "btn_check_booking": "Check My Reservation",
    "rules_header": "*Reservation Rules*\n\n{rules}\n\nPlease read before proceeding.",
    "rules_agree": "I Agree - Continue",
    "rules_disagree": "I Disagree - Exit",
    "rules_no": "No problem! Send /start to begin again.",
    "choose_service": "Choose one or more services, then tap Confirm:",
    "service_not_found": "Service not found. Please choose again.",
    "no_services": "No services are available right now. Please try again later.",
    "btn_done": "✅ Confirm Selection",
    "no_service_selected": "Please select at least one service first.",
    "time_day_label": "Day: 10 AM - 6 PM",
    "time_night_label": "Night: 6 PM - 12 AM",
    "choose_barber": "Choose your barber:",
    "barber_not_found": "Barber not found. Please choose again.",
    "no_barbers": "No barbers are available right now. Please try again later.",
    "choose_time_preference": "Choose your preferred time:",
    "name_prompt": "Please enter your full name:",
    "name_error": "Letters and spaces only, min 3 characters.\nTry again:",
    "phone_prompt": "Enter your phone number:",
    "phone_error": "Digits only (optional leading +), min 7 digits.\nTry again:",
    "confirm_summary": _CONFIRM_SUMMARY,
    "btn_agree": "Agree",
    "btn_change": "Change something",
    "btn_cancel": "Cancel",
    "booking_cancelled": "Reservation cancelled. Send /start to begin again.",
    "booking_confirmed": (
        "*Your reservation is confirmed!*\n"
        "Reference: *{ref}*\n"
        "Salon phone: {host_phone}\n\n"
        "Please contact us if you need to adjust your appointment."
    ),
    "booking_error": "Something went wrong. Please try again.",
    "edit_prompt": "What would you like to change?",
    "btn_edit_service": "Service",
    "btn_edit_barber": "Barber",
    "btn_edit_time_preference": "Preferred time",
    "btn_edit_name": "Name",
    "btn_edit_phone": "Phone",
    "name_new_prompt": "Enter your new full name:",
    "phone_new_prompt": "Enter your new phone number:",
    "cancelled": "Cancelled. Send /start to begin again.",
    "check_ref_prompt": "Enter your reservation reference (e.g. BK-000042):\n\nType /cancel to exit.",
    "check_ref_invalid": "Invalid format. Expected: BK-XXXXXX\nTry again or /cancel:",
    "check_ref_not_found": "Reservation {ref} not found.\nTry again or /cancel:",
    "check_error": "Something went wrong. Please try again or /cancel:",
    "booking_detail": _BOOKING_DETAIL,
}

_AR = {
    "choose_lang": "اختر لغتك:",
    "lang_btn_en": "English",
    "lang_btn_ar": "العربية",
    "main_menu": "أهلا بك في صالون الرجال. ماذا تريد أن تفعل؟",
    "btn_new_booking": "حجز جديد",
    "btn_check_booking": "تتبع حجزي",
    "rules_header": "*سياسة حجز الصالون*\n\n{rules}\n\nيرجى القراءة قبل المتابعة.",
    "rules_agree": "موافق - متابعة",
    "rules_disagree": "غير موافق - خروج",
    "rules_no": "لا مشكلة! أرسل /start للبدء من جديد.",
    "choose_service": "اختر خدمة أو أكثر ثم اضغط تأكيد:",
    "service_not_found": "الخدمة غير موجودة. يرجى الاختيار مرة أخرى.",
    "no_services": "لا توجد خدمات متاحة حاليا. يرجى التواصل مع الصالون.",
    "btn_done": "✅ تأكيد الاختيار",
    "no_service_selected": "يرجى اختيار خدمة واحدة على الأقل.",
    "time_day_label": "نهار: 10 ص - 6 م",
    "time_night_label": "ليل: 6 م - 12 ص",
    "choose_barber": "اختر الحلاق:",
    "barber_not_found": "الحلاق غير موجود. يرجى الاختيار مرة أخرى.",
    "no_barbers": "لا يوجد حلاقون متاحون حاليا. يرجى التواصل مع الصالون.",
    "choose_time_preference": "اختر الوقت المفضل:",
    "name_prompt": "أدخل اسمك الكامل:",
    "name_error": "الأحرف والمسافات فقط، 3 أحرف على الأقل.\nحاول مرة أخرى:",
    "phone_prompt": "أدخل رقم هاتفك:",
    "phone_error": "أرقام فقط (+ اختياري في البداية)، 7 أرقام على الأقل.\nحاول مرة أخرى:",
    "confirm_summary": (
        "*راجع حجزك:*\n\n"
        "الخدمة: {service_name}\n"
        "الحلاق: {barber_name}\n"
        "الوقت المفضل: {time_preference}\n"
        "العميل: {customer_name}\n"
        "الهاتف: {phone}"
    ),
    "btn_agree": "موافق",
    "btn_change": "تغيير شيء",
    "btn_cancel": "إلغاء",
    "booking_cancelled": "تم إلغاء الحجز. أرسل /start للبدء من جديد.",
    "booking_confirmed": (
        "*تم تأكيد حجزك!*\n"
        "رقم الحجز: *{ref}*\n"
        "هاتف الصالون: {host_phone}\n\n"
        "يرجى التواصل معنا إذا أردت تعديل موعدك."
    ),
    "booking_error": "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    "edit_prompt": "ماذا تريد أن تغير؟",
    "btn_edit_service": "الخدمة",
    "btn_edit_barber": "الحلاق",
    "btn_edit_time_preference": "الوقت المفضل",
    "btn_edit_name": "الاسم",
    "btn_edit_phone": "الهاتف",
    "name_new_prompt": "أدخل اسمك الكامل الجديد:",
    "phone_new_prompt": "أدخل رقم هاتفك الجديد:",
    "cancelled": "تم الإلغاء. أرسل /start للبدء من جديد.",
    "check_ref_prompt": "أدخل رقم الحجز (مثال: BK-000042):\n\nاكتب /cancel للخروج.",
    "check_ref_invalid": "صيغة غير صحيحة. المطلوب: BK-XXXXXX\nحاول مرة أخرى أو /cancel:",
    "check_ref_not_found": "لا يوجد حجز برقم {ref}.\nحاول مرة أخرى أو /cancel:",
    "check_error": "حدث خطأ ما. يرجى المحاولة مرة أخرى أو /cancel:",
    "booking_detail": (
        "*تفاصيل حجزك*\n\n"
        "الخدمة: {service_name}\n"
        "الحلاق: {barber_name}\n"
        "الوقت المفضل: {time_preference}\n"
        "العميل: {customer_name}\n"
        "الهاتف: {phone}\n"
        "رقم الحجز: {booking_ref}\n"
        "هاتف الصالون: {host_phone}"
    ),
}

_S = {
    "en": _COMMON,
    "ar": _AR,
}


def t(key: str, lang: str = "en", **kwargs) -> str:
    val = _S.get(lang, _S["en"]).get(key) or _S["en"].get(key, key)
    if isinstance(val, str) and kwargs:
        return val.format(**kwargs)
    return val
