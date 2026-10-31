import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core.dart';
import '../env.dart';
import '../net.dart';
import '../theme.dart';
import '../widgets.dart';
import 'room.dart';

String errText(Object? e) {
  if (e is NetError) {
    if (e.code == 'offline') return 'No hay conexión con el servidor. Probá de nuevo en un momento.';
    if (e.code == 'notfound') return 'No existe una sala con ese código. Revisalo con quien te invitó.';
    if (e.code == 'denied') return 'El servidor no aceptó la operación.';
    if (e.code == 'auth') return 'No se pudo iniciar sesión en el servidor.';
  }
  return 'Algo salió mal. Probá de nuevo.';
}

InputDecoration fieldDecoration(String hint) => InputDecoration(
      hintText: hint,
      hintStyle: sans(16, color: C.faint),
      filled: true,
      fillColor: C.surface,
      counterText: '',
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.line2)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.line2)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.accent)),
      disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.line)),
    );

/// Crear una sala o entrar con un código.
class RoomsScreen extends StatefulWidget {
  const RoomsScreen({super.key});
  @override
  State<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends State<RoomsScreen> {
  final TextEditingController _name = TextEditingController(text: env.name);
  final TextEditingController _code = TextEditingController();
  int rounds = 8;
  String error = '';
  bool busyCreate = false;
  bool busyJoin = false;

  bool get on => env.net.enabled;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<String?> _needName() async {
    final n = sanitizeName(_name.text);
    if (n.isEmpty) {
      setState(() => error = 'Escribí tu apodo para que los demás te reconozcan.');
      return null;
    }
    await env.setName(n);
    return n;
  }

  Future<void> _create() async {
    setState(() => error = '');
    final name = await _needName();
    if (name == null) return;
    setState(() => busyCreate = true);
    try {
      final items = pickItems(env.products, rounds < env.products.length ? rounds : env.products.length, math.Random().nextDouble);
      final code = await env.net.createRoom(items, name);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RoomScreen(code: code)));
    } catch (e) {
      if (mounted) setState(() => error = errText(e));
    }
    if (mounted) setState(() => busyCreate = false);
  }

  Future<void> _join() async {
    setState(() => error = '');
    final name = await _needName();
    if (name == null) return;
    final code = normalizeCode(_code.text);
    if (code.length != 6) {
      setState(() => error = 'El código tiene 6 letras y números.');
      return;
    }
    setState(() => busyJoin = true);
    try {
      await env.net.joinRoom(code, name);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RoomScreen(code: code)));
    } catch (e) {
      if (mounted) setState(() => error = errText(e));
    }
    if (mounted) setState(() => busyJoin = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          behavior: HitTestBehavior.translucent,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
            children: [
              TopBar(title: 'Sala online', onBack: () => Navigator.of(context).pop()),
              Text('Jugá contra tus amigos.\nCada uno a su hora.', style: sans(26, w: FontWeight.w800, ls: -0.6, h: 1.1)),
              const SizedBox(height: 8),
              Text('Todos juegan los mismos productos. Cuando cada uno termina, aparece en la tabla.',
                  style: sans(14, color: C.muted, h: 1.4)),
              if (!on) ...[
                const SizedBox(height: 14),
                Panel(
                  color: const Color(0xFF1B1708),
                  border: const Color(0xFF5A4513),
                  child: Text('Las salas online todavía no están activadas en esta versión.', style: sans(14, color: C.gold)),
                ),
              ],
              const SizedBox(height: 20),
              Kicker('Tu apodo', color: C.faint),
              const SizedBox(height: 8),
              TextField(
                controller: _name,
                enabled: on,
                maxLength: 14,
                style: sans(16),
                decoration: fieldDecoration('Cómo te ven los demás'),
              ),
              const SizedBox(height: 22),
              Kicker('Crear una sala', color: C.faint),
              const SizedBox(height: 8),
              Row(children: [
                for (final n in const [5, 8, 10])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('$n productos'),
                      selected: rounds == n,
                      onSelected: on ? (_) => setState(() => rounds = n) : null,
                      labelStyle: sans(13, color: rounds == n ? C.accentInk : C.ink, w: FontWeight.w600),
                      selectedColor: C.accent,
                      backgroundColor: C.surface,
                      side: const BorderSide(color: C.line2),
                      showCheckmark: false,
                    ),
                  ),
              ]),
              const SizedBox(height: 10),
              PrimaryButton(busyCreate ? 'Creando…' : 'Crear sala', onPressed: on && !busyCreate ? _create : null),
              const SizedBox(height: 24),
              Kicker('Entrar con un código', color: C.faint),
              const SizedBox(height: 8),
              TextField(
                controller: _code,
                enabled: on,
                maxLength: 6,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
                style: mono(22, w: FontWeight.w700, ls: 4),
                textAlign: TextAlign.center,
                decoration: fieldDecoration('CÓDIGO'),
                onChanged: (v) {
                  final up = normalizeCode(v);
                  if (up != v) {
                    _code.value = TextEditingValue(text: up, selection: TextSelection.collapsed(offset: up.length));
                  }
                },
                onSubmitted: (_) => _join(),
              ),
              const SizedBox(height: 10),
              SecondaryButton(busyJoin ? 'Entrando…' : 'Entrar a la sala', onPressed: on && !busyJoin ? _join : null),
              if (error.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(error, style: sans(14, color: C.bad, h: 1.35)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
