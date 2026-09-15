import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/tokens.dart';

/// A one-time code as six boxes (FB-4), for both apps' sign-in.
///
/// One real, invisible text field sits over the boxes, so the phone's code
/// autofill, paste and backspace work as in any field; the boxes only show
/// what it holds. [onCompleted] fires when the last digit is typed.
class OtpCodeField extends StatefulWidget {
  const OtpCodeField({
    super.key,
    required this.controller,
    this.onCompleted,
    this.length = 6,
    this.enabled = true,
  });

  final TextEditingController controller;
  final ValueChanged<String>? onCompleted;
  final int length;
  final bool enabled;

  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Semantics(
      label: 'Code',
      child: SizedBox(
        height: 56,
        child: Stack(
          children: [
            ListenableBuilder(
              listenable: Listenable.merge([widget.controller, _focus]),
              builder: (context, _) {
                final text = widget.controller.text;
                return Row(
                  children: [
                    for (var i = 0; i < widget.length; i++)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                          child: _Box(
                            digit: i < text.length ? text[i] : '',
                            active: _focus.hasFocus &&
                                (i == text.length || (i == widget.length - 1 && text.length == widget.length)),
                            scheme: scheme,
                            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
            // The field that takes the typing, over the boxes and invisible.
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  enabled: widget.enabled,
                  autofocus: true,
                  showCursor: false,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(widget.length),
                  ],
                  decoration: const InputDecoration(border: InputBorder.none, counterText: ''),
                  onChanged: (value) {
                    if (value.length == widget.length) widget.onCompleted?.call(value);
                  },
                  onSubmitted: (value) {
                    if (value.length == widget.length) widget.onCompleted?.call(value);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.digit, required this.active, required this.scheme, this.style});

  final String digit;
  final bool active;
  final ColorScheme scheme;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppRadius.input),
        border: Border.all(
          color: active ? scheme.primary : (digit.isEmpty ? scheme.outlineVariant : scheme.outline),
          width: active ? 2 : 1,
        ),
      ),
      child: Text(digit, style: style),
    );
  }
}
