; Generic 8-bit lite runtime. Applications provide the three raw hook symbols.
	.module	raw_lite
	.globl	main
	.globl	exit
	.globl	putchar
	.globl	getchar
	.globl	puts
	.globl	__mz80_raw_putc
	.globl	__mz80_raw_getc
	.globl	__mz80_raw_exit
	.globl	.gchar
	.globl	.gint
	.area	_CODE
START:
	call	main
	ld	hl,#0
	call	exit
getchar:
	jp	__mz80_raw_getc
putchar:
	ld	hl,#2
	add	hl,sp
	call	.gint
	jp	__mz80_raw_putc
puts:
	ld	hl,#2
	add	hl,sp
	call	.gint
.puts_loop:
	ld	a,(hl)
	or	a
	jr	z,.puts_newline
	push	hl
	ld	h,#0
	ld	l,a
	push	hl
	call	__mz80_raw_putc
	pop	bc
	pop	hl
	inc	hl
	jr	.puts_loop
.puts_newline:
	ld	hl,#10
	push	hl
	call	__mz80_raw_putc
	pop	bc
	ld	hl,#0
	ret
exit:
	ld	hl,#2
	add	hl,sp
	call	.gint
	jp	__mz80_raw_exit
.gchar:
	ld	l,(hl)
	ld	h,#0
	ret
.gint:
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
