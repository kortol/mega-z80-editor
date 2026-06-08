	.globl	getchar
	.globl	main
	.module	cpm_getchar.i
	.area	_CODE
main:
	call	getchar
	ret
	.area	_BSS
