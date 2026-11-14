slint::slint! {
    export component MainWindow inherits Window {
        title: "Otium";
        preferred-width: 1140px;
        preferred-height: 800px;
        min-width: 800px;
        min-height: 560px;
        default-font-family: "Cairo, sans-serif";

        in-out property <color> bg_canvas: #000000;
        in-out property <color> bg_surface: #0a0a0a;
        in-out property <color> bg_card: #141414;
        in-out property <color> text_primary: #ededed;
        in-out property <color> text_muted: #737373;
        in-out property <color> accent: #10b981;
        in-out property <color> border_color: #262626;

        in-out property <string> theme_name: "Obsidian Black (حجر السج الأسود)";
        in-out property <string> active_document_title: "لا يوجد مستند مفتوح";
        in-out property <int> active_screen: 0; // 0: Library, 1: Reader, 2: Slides, 3: Whiteboard, 4: Scanner, 5: Beam, 6: Vault
        in-out property <int> current_page: 1;
        in-out property <int> total_pages: 1;
        in-out property <string> beam_pin: "482915";
        in-out property <string> pairing_status: "جاهز للاقتران عبر الشبكة المحلية";
        in-out property <string> status_message: "Otium جاهز للاستخدام";
        in-out property <string> slide_text: "معمارية معالجة الوسائط والمستندات\n\n• فك ضغط وحفظ العروض التقديمية في الذاكرة\n• معالجة XML فائقة السرعة للمستندات\n• حفظ رسومات القلم وتصدير الشروحات لـ SVG بدون تعديل الملف الأصلي";
        in-out property <string> slide_notes: "ملاحظات المحاضر: التأكيد على حماية الخصوصية واستقلالية التطبيق.";
        in-out property <string> pdf_meta_info: "مستند تجريبي: كتاب دراسي - معمارية الأنظمة المدمجة";
        in-out property <string> vault_status: "الخزينة مقفلة ومحمية بتشفير محلي";
        in-out property <bool> vault_unlocked: false;
        in-out property <int> ink_stroke_count: 0;
        in-out property <string> scanner_info: "جاهز لمعالجة المستندات وتصحيح المنظور أو دمج بطاقات الهوية A4";

        callback cycle_theme();
        callback switch_screen(int);
        callback open_file_dialog();
        callback next_page();
        callback prev_page();
        callback generate_new_beam_pin();
        callback undo_stroke();
        callback redo_stroke();
        callback clear_strokes();
        callback export_svg_dialog();
        callback set_ink_color(string);
        callback record_ink_point(float, float, bool);
        callback unlock_vault_with_pin(string);
        callback run_scanner_stitch();

        background: bg_canvas;

        VerticalLayout {
            padding: 14px;
            spacing: 12px;

            // 1. Top Navigation Bar
            Rectangle {
                height: 58px;
                background: bg_surface;
                border-radius: 14px;
                border-width: 1px;
                border-color: border_color;

                HorizontalLayout {
                    padding-left: 18px;
                    padding-right: 18px;
                    spacing: 10px;
                    alignment: space-between;

                    // Brand Title
                    HorizontalLayout {
                        spacing: 12px;
                        alignment: start;

                        Text {
                            text: "Otium";
                            color: text_primary;
                            font-size: 22px;
                            font-weight: 800;
                            vertical-alignment: center;
                        }
                    }

                    // Navigation Tabs
                    HorizontalLayout {
                        spacing: 6px;
                        alignment: center;

                        Rectangle {
                            height: 34px;
                            background: active_screen == 0 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 0 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(0); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "المكتبة";
                                    color: active_screen == 0 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 1 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 1 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(1); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "القارئ (PDF)";
                                    color: active_screen == 1 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 2 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 2 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(2); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "الشرائح (PPTX)";
                                    color: active_screen == 2 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 3 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 3 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(3); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "السبورة";
                                    color: active_screen == 3 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 4 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 4 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(4); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "الماسح";
                                    color: active_screen == 4 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 5 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 5 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(5); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "البث (Beam)";
                                    color: active_screen == 5 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }

                        Rectangle {
                            height: 34px;
                            background: active_screen == 6 ? bg_card : transparent;
                            border-radius: 8px;
                            border-width: active_screen == 6 ? 1px : 0px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(6); } }
                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                Text {
                                    text: "الخزينة";
                                    color: active_screen == 6 ? text_primary : text_muted;
                                    font-size: 13px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }
                    }

                    // Theme Button
                    HorizontalLayout {
                        spacing: 8px;
                        alignment: end;

                        Rectangle {
                            height: 34px;
                            background: bg_card;
                            border-radius: 10px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { cycle_theme(); } }

                            HorizontalLayout {
                                padding-left: 12px;
                                padding-right: 12px;
                                spacing: 8px;
                                alignment: center;

                                Rectangle {
                                    width: 10px;
                                    height: 10px;
                                    border-radius: 5px;
                                    background: accent;
                                }

                                Text {
                                    text: theme_name;
                                    color: text_primary;
                                    font-size: 12px;
                                    font-weight: 600;
                                    vertical-alignment: center;
                                }
                            }
                        }
                    }
                }
            }

            // 2. Main Viewport Area
            Rectangle {
                background: bg_surface;
                border-radius: 16px;
                border-width: 1px;
                border-color: border_color;

                // Screen 0: Library & Home
                if active_screen == 0: VerticalLayout {
                    padding: 28px;
                    spacing: 20px;
                    alignment: center;

                    Text {
                        text: "Otium";
                        color: text_primary;
                        font-size: 32px;
                        font-weight: 800;
                        horizontal-alignment: center;
                    }

                    Text {
                        text: "قارئ هادئ ومكتبة وسائط ومستندات محلية حرة بدون أي تتبع أو إعلانات";
                        color: text_muted;
                        font-size: 14px;
                        horizontal-alignment: center;
                    }

                    // Open File Primary Action Button
                    Rectangle {
                        width: 260px;
                        height: 46px;
                        background: accent;
                        border-radius: 12px;

                        TouchArea { clicked => { open_file_dialog(); } }

                        HorizontalLayout {
                            alignment: center;
                            spacing: 8px;

                            Text {
                                text: "📂 فتح مستند (PDF / PPTX / صور)";
                                color: #ffffff;
                                font-size: 14px;
                                font-weight: 700;
                                vertical-alignment: center;
                            }
                        }
                    }

                    // Feature Cards Grid
                    HorizontalLayout {
                        spacing: 14px;
                        alignment: center;

                        Rectangle {
                            width: 160px;
                            height: 120px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(1); } }
                            VerticalLayout {
                                padding: 14px;
                                spacing: 6px;
                                alignment: center;
                                Text { text: "📖"; font-size: 24px; horizontal-alignment: center; }
                                Text { text: "قارئ الكتب (PDF)"; color: text_primary; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "عرض مزدوج وفردي"; color: text_muted; font-size: 10px; horizontal-alignment: center; }
                            }
                        }

                        Rectangle {
                            width: 160px;
                            height: 120px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(2); } }
                            VerticalLayout {
                                padding: 14px;
                                spacing: 6px;
                                alignment: center;
                                Text { text: "📊"; font-size: 24px; horizontal-alignment: center; }
                                Text { text: "عارض الشرائح PPTX"; color: text_primary; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "عرض سريع بدون أوفيس"; color: text_muted; font-size: 10px; horizontal-alignment: center; }
                            }
                        }

                        Rectangle {
                            width: 160px;
                            height: 120px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(3); } }
                            VerticalLayout {
                                padding: 14px;
                                spacing: 6px;
                                alignment: center;
                                Text { text: "✏️"; font-size: 24px; horizontal-alignment: center; }
                                Text { text: "السبورة والتدوين"; color: text_primary; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "استجابة فورية وتصدير SVG"; color: text_muted; font-size: 10px; horizontal-alignment: center; }
                            }
                        }

                        Rectangle {
                            width: 160px;
                            height: 120px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(4); } }
                            VerticalLayout {
                                padding: 14px;
                                spacing: 6px;
                                alignment: center;
                                Text { text: "📷"; font-size: 24px; horizontal-alignment: center; }
                                Text { text: "الماسح الضوئي"; color: text_primary; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "دمج البطاقات A4"; color: text_muted; font-size: 10px; horizontal-alignment: center; }
                            }
                        }

                        Rectangle {
                            width: 160px;
                            height: 120px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;
                            TouchArea { clicked => { switch_screen(6); } }
                            VerticalLayout {
                                padding: 14px;
                                spacing: 6px;
                                alignment: center;
                                Text { text: "🔒"; font-size: 24px; horizontal-alignment: center; }
                                Text { text: "الخزينة المشفرة"; color: text_primary; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "حماية محلية برمز PIN"; color: text_muted; font-size: 10px; horizontal-alignment: center; }
                            }
                        }
                    }

                    // Bottom info box
                    Rectangle {
                        width: 780px;
                        height: 70px;
                        background: bg_card;
                        border-radius: 12px;
                        border-width: 1px;
                        border-color: border_color;

                        HorizontalLayout {
                            padding-left: 20px;
                            padding-right: 20px;
                            spacing: 20px;
                            alignment: space-around;

                            VerticalLayout {
                                alignment: center;
                                Text { text: "أمان وخصوصية تامة"; color: accent; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "يعمل أوفلاين بالكامل بدون خوادم"; color: text_muted; font-size: 11px; horizontal-alignment: center; }
                            }

                            VerticalLayout {
                                alignment: center;
                                Text { text: "أداء فائق السرعة"; color: accent; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "استهلاك خفيف جداً للذاكرة"; color: text_muted; font-size: 11px; horizontal-alignment: center; }
                            }

                            VerticalLayout {
                                alignment: center;
                                Text { text: "8 ثيمات متقدمة"; color: accent; font-size: 13px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "راحة العين في القراءة الليلية"; color: text_muted; font-size: 11px; horizontal-alignment: center; }
                            }
                        }
                    }
                }

                // Screen 1: Reader View (PDF & Documents)
                if active_screen == 1: VerticalLayout {
                    padding: 20px;
                    spacing: 14px;

                    HorizontalLayout {
                        alignment: space-between;

                        Text {
                            text: "📄 المستند: " + active_document_title;
                            color: text_primary;
                            font-size: 15px;
                            font-weight: 700;
                            vertical-alignment: center;
                        }

                        HorizontalLayout {
                            spacing: 8px;

                            Rectangle {
                                width: 85px;
                                height: 32px;
                                background: bg_card;
                                border-radius: 8px;
                                border-width: 1px;
                                border-color: border_color;
                                TouchArea { clicked => { prev_page(); } }
                                Text { text: "السابق"; color: text_primary; font-size: 12px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Text {
                                text: "صفحة " + current_page + " من " + total_pages;
                                color: text_muted;
                                font-size: 13px;
                                font-weight: 600;
                                vertical-alignment: center;
                            }

                            Rectangle {
                                width: 85px;
                                height: 32px;
                                background: bg_card;
                                border-radius: 8px;
                                border-width: 1px;
                                border-color: border_color;
                                TouchArea { clicked => { next_page(); } }
                                Text { text: "التالي"; color: text_primary; font-size: 12px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Rectangle {
                                width: 110px;
                                height: 32px;
                                background: accent;
                                border-radius: 8px;
                                TouchArea { clicked => { open_file_dialog(); } }
                                Text { text: "فتح ملف آخر"; color: #ffffff; font-size: 12px; font-weight: 700; horizontal-alignment: center; vertical-alignment: center; }
                            }
                        }
                    }

                    // Book Spread Layout (Dual-Page View with Spine)
                    Rectangle {
                        background: bg_canvas;
                        border-radius: 12px;
                        border-width: 1px;
                        border-color: border_color;

                        HorizontalLayout {
                            // Left Page
                            Rectangle {
                                background: bg_card;
                                border-radius: 8px;

                                VerticalLayout {
                                    padding: 22px;
                                    spacing: 12px;

                                    Text {
                                        text: "الصفحة " + current_page;
                                        color: accent;
                                        font-size: 12px;
                                        font-weight: 700;
                                    }

                                    Text {
                                        text: pdf_meta_info;
                                        color: text_primary;
                                        font-size: 15px;
                                        font-weight: 700;
                                    }

                                    Text {
                                        text: "معمارية معالجة المستندات:\n\nتتم معالجة المستندات وتنسيق الخطوط محلياً لضمان تجربة قراءة مريحة مع دعم التشكيل ثنائي اللغة للخطوط العربية.";
                                        color: text_primary;
                                        font-size: 13px;
                                        wrap: word-wrap;
                                    }
                                }
                            }

                            // Spine Divider
                            Rectangle {
                                width: 2px;
                                background: border_color;
                            }

                            // Right Page
                            Rectangle {
                                background: bg_card;
                                border-radius: 8px;

                                VerticalLayout {
                                    padding: 22px;
                                    spacing: 12px;

                                    Text {
                                        text: "الصفحة " + (current_page + 1);
                                        color: accent;
                                        font-size: 12px;
                                        font-weight: 700;
                                    }

                                    Text {
                                        text: "خصائص المعالجة البيانية:";
                                        color: text_primary;
                                        font-size: 14px;
                                        font-weight: 700;
                                    }

                                    Text {
                                        text: "• سرعة معالجة عالية بفضل تفادي طبقات التجريد الزائدة\n• استهلاك ذاكرة منخفض للغاية أثناء تصفح المراجع الكبيرة\n• دعم كامل لعرض المستندات بأسلوب الكتاب الحقيقي لتقليل إجهاد النظر";
                                        color: text_muted;
                                        font-size: 13px;
                                        wrap: word-wrap;
                                    }
                                }
                            }
                        }
                    }
                }

                // Screen 2: Slides Presentation View (PPTX)
                if active_screen == 2: VerticalLayout {
                    padding: 24px;
                    spacing: 14px;

                    HorizontalLayout {
                        alignment: space-between;

                        Text {
                            text: "📊 عارض ومحلل الشرائح PPTX";
                            color: text_primary;
                            font-size: 16px;
                            font-weight: 700;
                            vertical-alignment: center;
                        }

                        HorizontalLayout {
                            spacing: 8px;

                            Rectangle {
                                width: 85px;
                                height: 32px;
                                background: bg_card;
                                border-radius: 8px;
                                border-width: 1px;
                                border-color: border_color;
                                TouchArea { clicked => { prev_page(); } }
                                Text { text: "الشريحة السابقة"; color: text_primary; font-size: 11px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Text {
                                text: "شريحة " + current_page + " من " + total_pages;
                                color: text_muted;
                                font-size: 12px;
                                font-weight: 600;
                                vertical-alignment: center;
                            }

                            Rectangle {
                                width: 85px;
                                height: 32px;
                                background: bg_card;
                                border-radius: 8px;
                                border-width: 1px;
                                border-color: border_color;
                                TouchArea { clicked => { next_page(); } }
                                Text { text: "الشريحة التالية"; color: text_primary; font-size: 11px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Rectangle {
                                width: 110px;
                                height: 32px;
                                background: accent;
                                border-radius: 8px;
                                TouchArea { clicked => { open_file_dialog(); } }
                                Text { text: "فتح عرض PPTX"; color: #ffffff; font-size: 11px; font-weight: 700; horizontal-alignment: center; vertical-alignment: center; }
                            }
                        }
                    }

                    // 16:9 Presentation Canvas Simulation
                    Rectangle {
                        background: bg_canvas;
                        border-radius: 12px;
                        border-width: 1px;
                        border-color: border_color;

                        VerticalLayout {
                            padding: 28px;
                            spacing: 16px;
                            alignment: center;

                            Text {
                                text: "شريحة العرض رقم " + current_page;
                                color: accent;
                                font-size: 13px;
                                font-weight: 700;
                                horizontal-alignment: center;
                            }

                            Text {
                                text: slide_text;
                                color: text_primary;
                                font-size: 16px;
                                font-weight: 700;
                                horizontal-alignment: center;
                                wrap: word-wrap;
                            }

                            // Presenter Notes Box
                            Rectangle {
                                width: 680px;
                                height: 60px;
                                background: bg_card;
                                border-radius: 10px;
                                border-width: 1px;
                                border-color: border_color;

                                VerticalLayout {
                                    padding: 10px;
                                    spacing: 4px;
                                    alignment: center;
                                    Text {
                                        text: "ملاحظات المحاضر (Speaker Notes):";
                                        color: accent;
                                        font-size: 11px;
                                        font-weight: 700;
                                    }
                                    Text {
                                        text: slide_notes;
                                        color: text_muted;
                                        font-size: 11px;
                                        wrap: word-wrap;
                                    }
                                }
                            }
                        }
                    }
                }

                // Screen 3: Whiteboard (Ink Canvas)
                if active_screen == 3: VerticalLayout {
                    padding: 20px;
                    spacing: 12px;

                    HorizontalLayout {
                        alignment: space-between;

                        HorizontalLayout {
                            spacing: 10px;
                            Text {
                                text: "✏️ سبورة الرسم والتدوين";
                                color: text_primary;
                                font-size: 15px;
                                font-weight: 700;
                                vertical-alignment: center;
                            }

                            Text {
                                text: "عدد الخطوط: " + ink_stroke_count;
                                color: text_muted;
                                font-size: 12px;
                                vertical-alignment: center;
                            }
                        }

                        // Ink Actions & Color Palette
                        HorizontalLayout {
                            spacing: 8px;

                            // Palette Colors
                            Rectangle {
                                width: 24px;
                                height: 24px;
                                border-radius: 12px;
                                background: #10b981;
                                TouchArea { clicked => { set_ink_color("#10b981"); } }
                            }

                            Rectangle {
                                width: 24px;
                                height: 24px;
                                border-radius: 12px;
                                background: #38bdf8;
                                TouchArea { clicked => { set_ink_color("#38bdf8"); } }
                            }

                            Rectangle {
                                width: 24px;
                                height: 24px;
                                border-radius: 12px;
                                background: #f59e0b;
                                TouchArea { clicked => { set_ink_color("#f59e0b"); } }
                            }

                            Rectangle {
                                width: 24px;
                                height: 24px;
                                border-radius: 12px;
                                background: #ef4444;
                                TouchArea { clicked => { set_ink_color("#ef4444"); } }
                            }

                            Rectangle {
                                width: 24px;
                                height: 24px;
                                border-radius: 12px;
                                background: #f3f4f6;
                                TouchArea { clicked => { set_ink_color("#f3f4f6"); } }
                            }

                            Rectangle {
                                width: 75px;
                                height: 30px;
                                background: bg_card;
                                border-radius: 8px;
                                TouchArea { clicked => { undo_stroke(); } }
                                Text { text: "تراجع"; color: text_primary; font-size: 11px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Rectangle {
                                width: 75px;
                                height: 30px;
                                background: bg_card;
                                border-radius: 8px;
                                TouchArea { clicked => { redo_stroke(); } }
                                Text { text: "إعادة"; color: text_primary; font-size: 11px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Rectangle {
                                width: 75px;
                                height: 30px;
                                background: #7f1d1d;
                                border-radius: 8px;
                                TouchArea { clicked => { clear_strokes(); } }
                                Text { text: "مسح الكل"; color: #fecaca; font-size: 11px; horizontal-alignment: center; vertical-alignment: center; }
                            }

                            Rectangle {
                                width: 100px;
                                height: 30px;
                                background: accent;
                                border-radius: 8px;
                                TouchArea { clicked => { export_svg_dialog(); } }
                                Text { text: "تصدير SVG"; color: #ffffff; font-size: 11px; font-weight: 700; horizontal-alignment: center; vertical-alignment: center; }
                            }
                        }
                    }

                    // Interactive Drawing Area
                    Rectangle {
                        background: bg_canvas;
                        border-radius: 12px;
                        border-width: 1px;
                        border-color: border_color;

                        TouchArea {
                            pointer-event(event) => {
                                if (event.kind == PointerEventKind.down) {
                                    record_ink_point(self.mouse-x / 1px, self.mouse-y / 1px, true);
                                }
                            }
                            moved => {
                                record_ink_point(self.mouse-x / 1px, self.mouse-y / 1px, false);
                            }
                        }

                        VerticalLayout {
                            padding: 24px;
                            alignment: center;
                            spacing: 8px;

                            Text {
                                text: "منطقة الرسم التفاعلية باللمس والقلم";
                                color: text_muted;
                                font-size: 14px;
                                horizontal-alignment: center;
                            }

                            Text {
                                text: "انقر واسحب لرسم مسارات متجهة ناعمة مع إمكانية التصدير كـ SVG متجهي";
                                color: text_muted;
                                font-size: 12px;
                                horizontal-alignment: center;
                            }
                        }
                    }
                }

                // Screen 4: Scanner View
                if active_screen == 4: VerticalLayout {
                    padding: 28px;
                    spacing: 18px;
                    alignment: center;

                    Text {
                        text: "📷 الماسح الضوئي وتصحيح المنظور";
                        color: text_primary;
                        font-size: 20px;
                        font-weight: 800;
                        horizontal-alignment: center;
                    }

                    Text {
                        text: scanner_info;
                        color: text_muted;
                        font-size: 13px;
                        horizontal-alignment: center;
                    }

                    HorizontalLayout {
                        spacing: 16px;
                        alignment: center;

                        Rectangle {
                            width: 280px;
                            height: 180px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;

                            VerticalLayout {
                                padding: 18px;
                                spacing: 10px;
                                alignment: center;
                                Text { text: "🪪"; font-size: 32px; horizontal-alignment: center; }
                                Text { text: "دمج بطاقة الهوية وجهين على A4"; color: text_primary; font-size: 14px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "محاذاة الوجهين وطباعة 300 DPI"; color: text_muted; font-size: 11px; horizontal-alignment: center; }

                                Rectangle {
                                    width: 180px;
                                    height: 34px;
                                    background: accent;
                                    border-radius: 8px;
                                    TouchArea { clicked => { run_scanner_stitch(); } }
                                    Text { text: "تنفيذ دمج الهوية وتصدير A4"; color: #ffffff; font-size: 11px; font-weight: 700; horizontal-alignment: center; vertical-alignment: center; }
                                }
                            }
                        }

                        Rectangle {
                            width: 280px;
                            height: 180px;
                            background: bg_card;
                            border-radius: 14px;
                            border-width: 1px;
                            border-color: border_color;

                            VerticalLayout {
                                padding: 18px;
                                spacing: 10px;
                                alignment: center;
                                Text { text: "📐"; font-size: 32px; horizontal-alignment: center; }
                                Text { text: "تصحيح المنظور الهندسي"; color: text_primary; font-size: 14px; font-weight: 700; horizontal-alignment: center; }
                                Text { text: "استيفاء ثنائي خطي عالي الدقة"; color: text_muted; font-size: 11px; horizontal-alignment: center; }

                                Rectangle {
                                    width: 180px;
                                    height: 34px;
                                    background: bg_surface;
                                    border-radius: 8px;
                                    border-width: 1px;
                                    border-color: border_color;
                                    TouchArea { clicked => { open_file_dialog(); } }
                                    Text { text: "اختيار صورة مستند مائل"; color: text_primary; font-size: 11px; font-weight: 600; horizontal-alignment: center; vertical-alignment: center; }
                                }
                            }
                        }
                    }
                }

                // Screen 5: Smart Beam
                if active_screen == 5: VerticalLayout {
                    padding: 30px;
                    spacing: 18px;
                    alignment: center;

                    Text {
                        text: "📡 بث ومشاركة المستندات (Smart Beam)";
                        color: text_primary;
                        font-size: 22px;
                        font-weight: 800;
                        horizontal-alignment: center;
                    }

                    Text {
                        text: pairing_status;
                        color: accent;
                        font-size: 14px;
                        font-weight: 600;
                        horizontal-alignment: center;
                    }

                    Rectangle {
                        width: 220px;
                        height: 90px;
                        background: bg_card;
                        border-radius: 16px;
                        border-width: 2px;
                        border-color: accent;

                        VerticalLayout {
                            alignment: center;
                            spacing: 4px;

                            Text {
                                text: "رمز الاقتران (PIN Code)";
                                color: text_muted;
                                font-size: 12px;
                                horizontal-alignment: center;
                            }

                            Text {
                                text: beam_pin;
                                color: text_primary;
                                font-size: 32px;
                                font-weight: 800;
                                horizontal-alignment: center;
                            }
                        }
                    }

                    Rectangle {
                        width: 180px;
                        height: 36px;
                        background: accent;
                        border-radius: 10px;
                        TouchArea { clicked => { generate_new_beam_pin(); } }
                        Text {
                            text: "توليد رمز PIN جديد";
                            color: #ffffff;
                            font-size: 13px;
                            font-weight: 700;
                            horizontal-alignment: center;
                            vertical-alignment: center;
                        }
                    }
                }

                // Screen 6: Vault
                if active_screen == 6: VerticalLayout {
                    padding: 30px;
                    spacing: 18px;
                    alignment: center;

                    Text {
                        text: "🔒 الخزينة المشفرة محلياً";
                        color: text_primary;
                        font-size: 22px;
                        font-weight: 800;
                        horizontal-alignment: center;
                    }

                    Text {
                        text: vault_status;
                        color: vault_unlocked ? accent : text_muted;
                        font-size: 14px;
                        horizontal-alignment: center;
                    }

                    Rectangle {
                        width: 440px;
                        height: 140px;
                        background: bg_card;
                        border-radius: 14px;
                        border-width: 1px;
                        border-color: border_color;

                        VerticalLayout {
                            padding: 18px;
                            spacing: 10px;
                            alignment: center;

                            Text {
                                text: "تشفير محلي موثق برمز PIN شخصي";
                                color: text_muted;
                                font-size: 11px;
                                horizontal-alignment: center;
                            }

                            Rectangle {
                                width: 220px;
                                height: 38px;
                                background: accent;
                                border-radius: 10px;
                                TouchArea { clicked => { unlock_vault_with_pin("123456"); } }
                                Text {
                                    text: vault_unlocked ? "الخزينة مفكوكة ومؤمنة" : "فك تشفير الخزينة برمز PIN";
                                    color: #ffffff;
                                    font-size: 12px;
                                    font-weight: 700;
                                    horizontal-alignment: center;
                                    vertical-alignment: center;
                                }
                            }
                        }
                    }
                }
            }

            // 3. Bottom Status Bar
            Rectangle {
                height: 38px;
                background: bg_surface;
                border-radius: 10px;
                border-width: 1px;
                border-color: border_color;

                HorizontalLayout {
                    padding-left: 16px;
                    padding-right: 16px;
                    alignment: space-between;

                    Text {
                        text: status_message;
                        color: text_muted;
                        font-size: 12px;
                        vertical-alignment: center;
                    }

                    HorizontalLayout {
                        spacing: 8px;
                        alignment: end;

                        Rectangle {
                            width: 100px;
                            height: 26px;
                            background: bg_card;
                            border-radius: 6px;
                            TouchArea { clicked => { open_file_dialog(); } }
                            Text {
                                text: "📂 فتح مستند";
                                color: accent;
                                font-size: 11px;
                                font-weight: 700;
                                horizontal-alignment: center;
                                vertical-alignment: center;
                            }
                        }
                    }
                }
            }
        }
    }
}
